import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  Connection,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { sha256 } from "js-sha256";

import fs from "fs";


export function getOrCreateKeypair(dir: string, keyName: string): Keypair {
  // Verifica se la directory esiste; se non esiste, creala
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const authorityKey = `${dir}/${keyName}.json`;

  // Se il file della chiave esiste, leggilo e crea il Keypair
  if (fs.existsSync(authorityKey)) {
    try {
      const data = JSON.parse(fs.readFileSync(authorityKey, 'utf-8'));
      if (data && data.secretKey) {
        return Keypair.fromSecretKey(bs58.decode(data.secretKey));
      } else {
        throw new Error('Il file esiste ma non contiene una secretKey valida.');
      }
    } catch (error) {
      console.error(`Errore durante la lettura del file ${authorityKey}:`, error);
      throw error;
    }
  } else {
    // Se il file non esiste, crea un nuovo Keypair e salva le chiavi nel file
    const keypair = Keypair.generate();
    const data = {
      secretKey: bs58.encode(keypair.secretKey),
      publicKey: keypair.publicKey.toBase58(),
    };

    try {
      fs.writeFileSync(authorityKey, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`File della chiave creato: ${authorityKey}`);
      return keypair;
    } catch (error) {
      console.error(`Errore durante la scrittura del file ${authorityKey}:`, error);
      throw error;
    }
  }
}


export const printSOLBalance = async (
  connection: Connection,
  pubKey: PublicKey,
  info: string = ""
) => {
  const balance = await connection.getBalance(pubKey);
  console.log(
    `${info ? info + " " : ""}${pubKey.toBase58()}:`,
    balance / LAMPORTS_PER_SOL,
    `SOL`
  );
};

export const getSPLBalance = async (
  connection: Connection,
  mintAddress: PublicKey,
  pubKey: PublicKey,
  allowOffCurve: boolean = false
) => {
  try {
    let ata = getAssociatedTokenAddressSync(mintAddress, pubKey, allowOffCurve);
    const balance = await connection.getTokenAccountBalance(ata, "processed");
    return balance.value.uiAmount;
  } catch (e) {}
  return null;
};

export const printSPLBalance = async (
  connection: Connection,
  mintAddress: PublicKey,
  user: PublicKey,
  info: string = ""
) => {
  const balance = await getSPLBalance(connection, mintAddress, user);
  if (balance === null) {
    console.log(
      `${info ? info + " " : ""}${user.toBase58()}:`,
      "No Account Found"
    );
  } else {
    console.log(`${info ? info + " " : ""}${user.toBase58()}:`, balance);
  }
};

export const baseToValue = (base: number, decimals: number): number => {
  return base * Math.pow(10, decimals);
};

export const valueToBase = (value: number, decimals: number): number => {
  return value / Math.pow(10, decimals);
};

//i.e. account:BondingCurve
export function getDiscriminator(name: string) {
  return sha256.digest(name).slice(0, 8);
}
