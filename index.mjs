import { AzureOpenAI } from "openai";
import fs from 'fs';



const endpoint = process.env.AZURE_ENDPOINT;
const apiKey = process.env.AZURE_API_KEY;
const apiVersion = "2024-05-01-preview";



const client = new AzureOpenAI({endpoint: endpoint, apiKey : apiKey, apiVersion: apiVersion})


const assistant = await client.beta.assistants.create({
    name: "degreeworksParser",
    instructions: `You look at student transcipts and return a json that follows the following schema:{
  "type": "object",
  "properties": {
    "requirement": { "type": "string" },
    "status": { "type": "string"},
    "classesToComplete" : {
      "type":"array",
      "items":{"type":"string"}
    },
    "classesCompleted" : {
      "type":"array",
      "items":{"type":"string"}
    },
    "subrequirements" : {
      "type": "array",
      "items": { "$ref": "#" }
    }
  }
}
 `,
    model: "zotsiteschat",
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


console.log(file);

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
            "analyse 'test.pdf' and return the correct student json only containing requirements from the sections called general requirements or the ones that start with 'Major'.",
        // Attach the new file to the message.
        attachments: [{ file_id: aapl10k.id, tools: [{ type: "file_search" }] }],
        },
    ],
});

// The thread now has a vector store in its tool resources.
console.log(thread.tool_resources?.file_search);


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

console.log(text.value);
console.log(citations.join("\n"));
}





