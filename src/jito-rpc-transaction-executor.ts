import {
    BlockhashWithExpiryBlockHeight,
    Keypair,
    PublicKey,
    SystemProgram,
    Connection,
    TransactionMessage,
    VersionedTransaction,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { TransactionExecutor } from './transaction-executor.interface';

import axios, { AxiosError } from 'axios';
import https from 'https';
import bs58 from 'bs58';
import { set } from '@coral-xyz/anchor/dist/cjs/utils/features';

export class JitoTransactionExecutor implements TransactionExecutor {
    // https://jito-labs.gitbook.io/mev/searcher-resources/json-rpc-api-reference/bundles/gettipaccounts
    private jitpTipAccounts =  [
        '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
        'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
        'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
        'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
        'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
        'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
        'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
        '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
      ];
    private JitoFeeWallet: PublicKey;

    constructor(
        private readonly jitoFee: number,
        private readonly connection: Connection,
    ) {
        this.JitoFeeWallet = this.getRandomValidatorKey();
        
    }

    private getRandomValidatorKey(): PublicKey {
        const randomValidator = this.jitpTipAccounts[Math.floor(Math.random() * this.jitpTipAccounts.length)];
        return new PublicKey(randomValidator);
    }

    public async executeAndConfirm(
        transactionList: VersionedTransaction[],
        payer: Keypair,
        latestBlockhash: BlockhashWithExpiryBlockHeight,
    ): Promise<{ confirmed: boolean; signature?: string; error?: string }> {
        this.JitoFeeWallet = this.getRandomValidatorKey(); // Update wallet key each execution

        try {
            const fee = Math.floor(this.jitoFee * LAMPORTS_PER_SOL);
            const jitTipTxFeeMessage = new TransactionMessage({
                payerKey: payer.publicKey,
                recentBlockhash: latestBlockhash.blockhash,
                instructions: [
                    SystemProgram.transfer({
                        fromPubkey: payer.publicKey,
                        toPubkey: this.JitoFeeWallet,
                        lamports: fee,
                    }),
                ],
            }).compileToV0Message();

            const jitoFeeTx = new VersionedTransaction(jitTipTxFeeMessage);
            jitoFeeTx.sign([payer]);
            const jitoTxsignature = bs58.encode(jitoFeeTx.signatures[0]);

            const serializedjitoFeeTx = bs58.encode(jitoFeeTx.serialize());
            let serializedTransactions = [serializedjitoFeeTx];
            for (let i = 0; i < transactionList.length; i++) {
                serializedTransactions.push(bs58.encode(transactionList[i].serialize()));
            }

            const endpoints = [
                'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
                'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
                'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
                'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
                'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
                'https://slc.mainnet.block-engine.jito.wtf/api/v1/bundles',
            ];

            const client = axios.create({
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false,
                }),
            });

            for (let i = 0; i < 5; i++) {
                const requests = endpoints.map((url) =>
                    client.post(
                        url,
                        {
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'sendBundle',
                            params: [serializedTransactions],
                        },
                    ),
                );

                const results = await Promise.all(requests.map((p) => p.catch((e) => e)));
                const successfulResults = results.filter((result) => !(result instanceof Error));
                if (successfulResults.length > 0) {
                    return await this.confirm(jitoTxsignature, latestBlockhash);
                }
            }

            return { confirmed: false };

        } catch (error) {
            if (error instanceof AxiosError) {
                console.log({ error: error.response?.data }, 'Failed to execute jito transaction');
            }
            console.log('Error during transaction execution', error);
            return { confirmed: false, error: error.message };
        }
    }

    private async confirm(signature: string, latestBlockhash: BlockhashWithExpiryBlockHeight) {
        const confirmation = await this.connection.confirmTransaction(
            {
                signature,       
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            },
            this.connection.commitment,
        );

        return { confirmed: !confirmation.value.err, signature };
    }
}
