import dotenv from "dotenv";
import fs from "fs";
import { readFile } from "fs/promises";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { DEFAULT_DECIMALS, PumpFunSDK } from "../../src";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  getOrCreateKeypair,
  getSPLBalance,
  printSOLBalance,
  printSPLBalance,
} from "../util";
import metadata from "../../src/metadata";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

const KEYS_FOLDER = __dirname + "/.keys";
const SLIPPAGE_BASIS_POINTS = 100n;

async function createKeypair() {
  const keypair = Keypair.generate();
  const publicKeyBase58 = keypair.publicKey.toBase58();
  const secretKeyBase58 = bs58.encode(keypair.secretKey);

  const data = {
    "publicKey": publicKeyBase58,
    "secretKey": secretKeyBase58
  };
  const metadataString = JSON.stringify(data);
  const bufferContent = Buffer.from(metadataString, 'utf-8');
  fs.writeFileSync("./example/basic/.keys/mint.json", bufferContent);

  return keypair;
}

const main = async () => {
  dotenv.config();

  if (!process.env.HELIUS_RPC_URL) {
    console.error("Please set HELIUS_RPC_URL in .env file");
    console.error(
      "Example: HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=<your api key>"
    );
    console.error("Get one at: https://www.helius.dev");
    return;
  }

  let connection = new Connection(process.env.HELIUS_RPC_URL || "");
  let wallet = new NodeWallet(new Keypair());
  const provider = new AnchorProvider(connection, wallet, { commitment: "finalized" });

  await createKeypair();

  const testAccount = getOrCreateKeypair(KEYS_FOLDER, "test-account");
  const buyer = getOrCreateKeypair(KEYS_FOLDER, "buyer");
  
  const mint = getOrCreateKeypair(KEYS_FOLDER, "mint");

  await printSOLBalance(connection, testAccount.publicKey, "Test Account keypair");
  let sdk = new PumpFunSDK(provider);
  let globalAccount = await sdk.getGlobalAccount();
  console.log(globalAccount);

  let currentSolBalance = await connection.getBalance(testAccount.publicKey);
  if (currentSolBalance == 0) {
    console.log("Please send some SOL to the test-account:", testAccount.publicKey.toBase58());
    return;
  }

  let boundingCurveAccount = await sdk.getBondingCurveAccount(mint.publicKey);
  if (!boundingCurveAccount) {
    const fileBuffer = await readFile("./upload/bolt.jpg");
    const fileBlob = new Blob([fileBuffer], { type: "image/jpeg" });

    let tokenMetadata = {
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description,
      showName: metadata.showName,
      createOn: metadata.createdOn,
      twitter: metadata.twitter,
      telegram: metadata.telegram,
      website: metadata.website,
      file: fileBlob,
    };

    let createResults = await sdk.createAndBuy(
      testAccount,
      mint,
      [testAccount, buyer],
      tokenMetadata,
      BigInt(0.0001 * LAMPORTS_PER_SOL),
      SLIPPAGE_BASIS_POINTS,
      {
        unitLimit: 5_000_000,
        unitPrice: 200_000,
      }
    );

    if (createResults.confirmed) {
      console.log("Success:", `https://pump.fun/${mint.publicKey.toBase58()}`);
      console.log(createResults.jitoTxsignature);
      boundingCurveAccount = await sdk.getBondingCurveAccount(mint.publicKey);
      console.log("Bonding curve after create and buy", boundingCurveAccount);
      printSPLBalance(connection, mint.publicKey, testAccount.publicKey);
    }
  } else {
    console.log("boundingCurveAccount", boundingCurveAccount);
    console.log("Success:", `https://pump.fun/${mint.publicKey.toBase58()}`);
    printSPLBalance(connection, mint.publicKey, testAccount.publicKey);
  }
};

main();
