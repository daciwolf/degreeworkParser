import { AzureOpenAI } from "openai";

const deployment = ""// deployment name here
const apiVersion = ""//api version here
const endpoint = ""//enter azure endpoint here
const apiKey = ""//enter api key here
const client = new AzureOpenAI({endpoint: endpoint, apiKey : apiKey, apiVersion: apiVersion, deployment : deployment})


export class degreeworksParser{
    constructor(azureClient){
        
    }
};