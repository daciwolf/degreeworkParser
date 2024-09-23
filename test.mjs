import { AzureOpenAI } from "openai";
import fs from 'fs';
import { text } from "stream/consumers";



const endpoint = process.env.AZURE_ENDPOINT;
const apiKey = process.env.AZURE_API_KEY;
const apiVersion = "2024-05-01-preview";



const client = new AzureOpenAI({endpoint: endpoint, apiKey : apiKey, apiVersion: apiVersion})


const assistant = await client.beta.assistants.create({
    name: "degreeworksParser",
    instructions: `Analyze a student's transcript PDF and extract all the data presented, ensuring that no information is stripped or lost. The output should be easily parsable as text while preserving the structure and format of the original transcript. This includes maintaining sections like student information, course details, grades, and any other specific transcript content. Use indentation or other separators like the pipe symbol '|' to reflect tables and columns clearly in the output.
`,
    model: "zotsiteschat",
    temperature: 0,
    tools: [{ type: "file_search" }],
  });

const fileStreams = {
  files: ["tests/test.pdf"].map((path) =>
fs.createReadStream(path),
)};

const file  = await client.files.create({
  file: fs.createReadStream('tests/test.pdf'),
  purpose: "assistants",
});


// Create a vector store including our two files.
let vectorStore = await client.beta.vectorStores.create({
name: "Transcripts",
});

await client.beta.vectorStores.fileBatches.createAndPoll(vectorStore.id, {file_ids: [file.id]});

await client.beta.assistants.update(assistant.id, {tool_resources: {file_search: {vector_store_ids  : [vectorStore.id]}}});


// A user wants to attach a file to a specific message, let's upload it.
const aapl10k = await client.files.create({
    file: fs.createReadStream("tests/test.pdf"),
    purpose: "assistants",
  });
  
const thread = await client.beta.threads.create({
    messages: [
        {
        role: "user",
        content:
            "Analyze the file 'test.pdf' and extract all the information from the section titled 'General Requirements'and all sub-requirements from sections 1-8 are included, as well as any section beginning with 'Major'. The text output should maintain a similar structure to the original PDF, using indentation or the pipe symbol '|' to reflect tables and subsections clearly.",
        // Attach the new file to the message.
        attachments: [{ file_id: aapl10k.id, tools: [{ type: "file_search" }] }],
        },
    ],
});

// The thread now has a vector store in its tool resources.

const run = await client.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: assistant.id,
  });
   
const messages = await client.beta.threads.messages.list(thread.id, {
run_id: run.id,
});

const message = messages.data.pop();
if (message.content[0].type === "text") {
const { text } = message.content[0];
const { annotations } = text;
const citations = [];

let index = 0;
for (let annotation of annotations) {
    text.value = text.value.replace(annotation.text, "[" + index + "]");
    const { file_citation } = annotation;
    if (file_citation) {
    const citedFile = await client.files.retrieve(file_citation.file_id);
    citations.push("[" + index + "]" + citedFile.filename);
    }
    index++;
}

//console.log(text.value);
}
console.log(message.content[0].text.value)

const client08 = new AzureOpenAI({endpoint: endpoint, apiKey : apiKey, apiVersion: '2024-08-01-preview', deployment: "gpt-4o"})

const jsonComplete = await client08.chat.completions.create({
    temperature: 0,
    messages: [ {'role':'system',"content": "You are a bot that takes text describing a students transcript and returns a json that follows the strucutred output provided"},
    {"role": "system", "content": "Certain text means the following should you come across it: 'IP': 'In Progress', 'T': 'Transfered'"},
    {"role": "system", "content": "If a class has a grade, or is a transfer that class is considered complete, otherwise that class is considered incomplete, this information will help decide if status of requirement is complete or incomplete"},
    {"role": "user", "content": message.content[0].text.value}
    ],
    //model: "gpt-4o-2",
    response_format: {
        type: "json_schema",
        json_schema: {
            "name": "transcript_response",
            "schema": {
              "type": "object",
              "properties": {
                "requirements": {
                    "type":"array",
                    "items": {
                        "type":"object",
                        "properties": {
                            "requirement_name": { "type": "string" },
                            "status": { "type": "string"},
                            "classesToComplete" : {
                                "type":"array",
                                "items":{"type":"string"}
                            },
                            "classesCompleted" : {
                                "type":"array",
                                "items":{"type":"string"}
                            },
                            "subrequirements" : { "$ref": "#" }
                        }
                    }
                }
                
              },
              "additionalProperties": false,
              "required": ["requirements"]
            }
        }
    }
});




const jsonOutput = jsonComplete.choices[0].message.content;

console.log(jsonOutput)

fs.writeFileSync("test.json", jsonOutput);













