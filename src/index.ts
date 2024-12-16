
import Database from "better-sqlite3";
import DirectClient from "./clients/direct/index.ts";
import fs from "fs";
import yargs from "yargs";
import defaultCharacter from "./core/defaultCharacter.ts";
import { AgentRuntime } from "./core/runtime.ts";
import settings from "./core/settings.ts";
import { Character, IAgentRuntime } from "./core/types.ts";
import { wait } from "./clients/twitter/utils.ts";
import { TwitterGenerationClient } from "./clients/twitter/generate.ts";
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import OpenAI from "openai";
import { SqliteDatabaseAdapter } from "./adapters/sqlite.ts";

const baseURL = "http://localhost:11434/api/generate"

interface Arguments {
  character?: string;
  characters?: string;
  twitter?: boolean;
  discord?: boolean;
  telegram?: boolean;
}

let argv: Arguments = {
  character: "./src/agent/default_character.json",
  characters: "",
};


try {
  argv = yargs(process.argv.slice(2))
    .option("character", {
      type: "string",
      description: "Path to the character JSON file",
    })
    .option("characters", {
      type: "string",
      description: "Comma-separated list of paths to character JSON files",
    })
    .option("telegram", {
      type: "boolean",
      description: "Enable Telegram client",
      default: false,
    })
    .parseSync() as Arguments;
} catch (error) {
  console.log("Error parsing arguments:", error);
}

// Load character
const characterPath = argv.character || argv.characters;
console.log("characterPath", characterPath);

const characterPaths = argv.characters?.split(",").map((path) => path.trim());
console.log("characterPaths", characterPaths);

const characters = [];

const directClient = new DirectClient();
directClient.start(3000);

if (characterPaths?.length > 0) {
  for (const path of characterPaths) {
    try {
      const character = JSON.parse(fs.readFileSync(path, "utf8"));
      console.log("character", character.name);
      characters.push(character);
    } catch (e) {
      console.log(`Error loading character from ${path}: ${e}`);
    }
  }
}



async function startAgent(character: Character) {
  console.log("Starting agent for character " + character.name);
  const token = character.settings?.secrets?.OPENAI_API_KEY || (settings.OPENAI_API_KEY as string);

  console.log("token", token);
  const db = new SqliteDatabaseAdapter(new Database("./db.sqlite"));
  //const wallet = await setupWallet();
  //console.log(`Wallet set up for character ${character.name}:`, wallet);
  const model = "gemma3:1b"
  const runtime = new AgentRuntime({
    databaseAdapter: db,
    token,
    serverUrl: baseURL, // Use DeepInfra's OpenAI base URL
    model: model,
    evaluators: [],
    character,
    providers: [],
    actions: [],
  });



  console.log("runtime", runtime);

  const directRuntime = new AgentRuntime({
    databaseAdapter: db,
    token,
    serverUrl: baseURL, // Use DeepInfra's OpenAI base URL
    model: model,
    evaluators: [],
    character,
    providers: [],
    actions: [],
  });


  async function startTwitter(runtime: IAgentRuntime) {

    console.log("Starting generation client");
    const twitterGenerationClient = new TwitterGenerationClient(runtime);
    return {

      twitterGenerationClient,
    };
  }

  if (!character.clients) {
    return console.error("No clients found for character " + character.name);
  }

  const clients = [];


  if (character.clients.map((str) => str.toLowerCase()).includes("twitter")) {
    const { twitterGenerationClient } = await startTwitter(runtime);
    clients.push(twitterGenerationClient);
  }
  //twitterSearchClient, twitterGenerationClient
  directClient.registerAgent(directRuntime);

  return clients;
}

const startAgents = async () => {
  if (characters.length === 0) {
    console.log("No characters found, using default character");
    characters.push(defaultCharacter);
  }
  for (const character of characters) {
    await startAgent(character);
  }
};

startAgents();

import readline from "readline";


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function chat() {
  rl.question("You: ", async (input) => {
    if (input.toLowerCase() === "exit") {
      rl.close();
      return;
    }

    const agentId = characters[0].name.toLowerCase();
    const response = await fetch(`http://localhost:3000/${agentId}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: input,
        userId: "user",
        userName: "User",
      }),
    });

    const data = await response.json();
    console.log(`${characters[0].name}: ${data.text}`);
    chat();
  });
}

console.log("Chat started. Type 'exit' to quit.");
chat();

