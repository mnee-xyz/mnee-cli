import {
  BroadcastFailure,
  BroadcastResponse,
  Hash,
  P2PKH,
  PrivateKey,
  PublicKey,
  Script,
  Transaction,
  TransactionSignature,
  UnlockingScript,
} from "@bsv/sdk";
import axios from "axios";
import * as oneSat from "js-1sat-ord";
import { Utils } from "@bsv/sdk";
import {
  GetSignatures,
  MNEEBalance,
  MNEEConfig,
  MNEEOperation,
  MNEEUtxo,
  SendMNEE,
  SignatureRequest,
  SignatureResponse,
} from "./mnee.types.js";
import CosignTemplate from "./mneeCosignTemplate.js";
import { SingleLineLogger } from "./utils/helper.js";

export class MNEEService {
  private mneeApi = "https://proxy-api.mnee.net";
  private mneeApiToken = "92982ec1c0975f31979da515d46bae9f";
  private gorillaPoolApi = "https://ordinals.1sat.app";

  getConfig = async (): Promise<MNEEConfig | undefined> => {
    try {
      const { data } = await axios.get<MNEEConfig>(
        `${this.mneeApi}/v1/config?auth_token=${this.mneeApiToken}`
      );
      return data;
    } catch (error) {
      console.error("Failed to fetch config:", error);
    }
  };

  getBalance = async (address: string): Promise<MNEEBalance> => {
    try {
      const config = await this.getConfig();
      if (!config) throw new Error("Config not fetched");
      const res = await this.getUtxos(address);
      const balance = res.reduce((acc, utxo) => {
        if (utxo.data.bsv21.op === "transfer") {
          acc += utxo.data.bsv21.amt;
        }
        return acc;
      }, 0);

      const decimalAmount = parseFloat(
        (balance / 10 ** (config.decimals || 0)).toFixed(config.decimals)
      );
      const mneeBalance = { amount: balance, decimalAmount };

      return mneeBalance;
    } catch (error) {
      console.error("Failed to fetch balance:", error);
      return { amount: 0, decimalAmount: 0 };
    }
  };

  toAtomicAmount(amount: number, decimals: number): number {
    return Math.round(amount * 10 ** decimals);
  }

  private createInscription = (
    recipient: string,
    amount: number,
    config: MNEEConfig
  ) => {
    const inscriptionData = {
      p: "bsv-20",
      op: "transfer",
      id: config.tokenId,
      amt: amount.toString(),
    };
    return {
      lockingScript: oneSat.applyInscription(
        new CosignTemplate().lock(
          recipient,
          PublicKey.fromString(config.approver)
        ),
        {
          dataB64: Buffer.from(JSON.stringify(inscriptionData)).toString(
            "base64"
          ),
          contentType: "application/bsv-20",
        }
      ),
      satoshis: 1,
    };
  };

  getUtxos = async (
    address: string,
    ops: MNEEOperation[] = ["transfer", "deploy+mint"]
  ): Promise<MNEEUtxo[]> => {
    try {
      const { data } = await axios.post<MNEEUtxo[]>(
        `${this.mneeApi}/v1/utxos?auth_token=${this.mneeApiToken}`,
        [address]
      );

      if (ops.length) {
        return data.filter((utxo) =>
          ops.includes(
            utxo.data.bsv21.op.toLowerCase() as
              | "transfer"
              | "burn"
              | "deploy+mint"
          )
        );
      }

      return data;
    } catch (error) {
      console.error("Failed to fetch UTXOs:", error);
      return [];
    }
  };

  broadcast = async (
    tx: Transaction
  ): Promise<BroadcastResponse | BroadcastFailure> => {
    const url = `${this.gorillaPoolApi}/v5/tx`;

    const resp = await axios.post<{
      txid: string;
      success: boolean;
      error: string;
      status: number;
    }>(url, Buffer.from(tx.toBinary()), {
      headers: {
        "Content-Type": "application/octet-stream",
      },
    });
    const body = resp.data;

    if (resp.status !== 200) {
      return {
        status: "error",
        code: resp.status.toString(),
        description: body.error,
      } as BroadcastFailure;
    }
    return {
      status: "success",
      txid: body.txid,
      message: "Transaction broadcast successfully",
    } as BroadcastResponse;
  };

  fetchBeef = async (txid: string): Promise<Transaction> => {
    const resp = await fetch(`${this.gorillaPoolApi}/v5/tx/${txid}/beef`);
    if (resp.status == 404) throw new Error("Transaction not found");
    if (resp.status !== 200) {
      throw new Error(`${resp.status} - Failed to fetch beef for tx ${txid}`);
    }
    const beef = [...Buffer.from(await resp.arrayBuffer())];
    return Transaction.fromAtomicBEEF(beef);
  };

  getSignatures = async (
    request: GetSignatures,
    privateKey: PrivateKey
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{
    sigResponses?: SignatureResponse[];
    error?: { message: string; cause?: any };
  }> => {
    try {
      const DEFAULT_SIGHASH_TYPE = 65;
      let tx: Transaction;
      switch (request.format) {
        case "beef":
          tx = Transaction.fromHexBEEF(request.rawtx);
          break;
        case "ef":
          tx = Transaction.fromHexEF(request.rawtx);
          break;
        default:
          tx = Transaction.fromHex(request.rawtx);
          break;
      }
      const sigResponses: SignatureResponse[] = request.sigRequests.flatMap(
        (sigReq: SignatureRequest) => {
          return [privateKey].map((privKey: PrivateKey) => {
            // TODO: support multiple OP_CODESEPARATORs and get subScript according to `csIdx`. See SignatureRequest.csIdx in the GetSignatures type.
            const preimage = TransactionSignature.format({
              sourceTXID: sigReq.prevTxid,
              sourceOutputIndex: sigReq.outputIndex,
              sourceSatoshis: sigReq.satoshis,
              transactionVersion: tx.version,
              otherInputs: tx.inputs.filter(
                (_, index) => index !== sigReq.inputIndex
              ),
              inputIndex: sigReq.inputIndex,
              outputs: tx.outputs,
              inputSequence: tx.inputs[sigReq.inputIndex].sequence || 0,
              subscript: sigReq.script
                ? Script.fromHex(sigReq.script)
                : new P2PKH().lock(privKey.toPublicKey().toAddress()),
              lockTime: tx.lockTime,
              scope: sigReq.sigHashType || DEFAULT_SIGHASH_TYPE,
            });
            const rawSignature = privKey.sign(Hash.sha256(preimage));
            const sig = new TransactionSignature(
              rawSignature.r,
              rawSignature.s,
              sigReq.sigHashType || DEFAULT_SIGHASH_TYPE
            );
            return {
              sig: Utils.toHex(sig.toChecksigFormat()),
              pubKey: privKey.toPublicKey().toString(),
              inputIndex: sigReq.inputIndex,
              sigHashType: sigReq.sigHashType || DEFAULT_SIGHASH_TYPE,
              csIdx: sigReq.csIdx,
            };
          });
        }
      );
      return Promise.resolve({ sigResponses });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error("getSignatures error", err);
      return {
        error: {
          message: err.message ?? "unknown",
          cause: err.cause,
        },
      };
    }
  };

  transfer = async (
    address: string,
    request: SendMNEE[],
    privateKey: PrivateKey,
    logger: SingleLineLogger
  ): Promise<{ txid?: string; rawtx?: string; error?: string }> => {
    try {
      const config = await this.getConfig();
      if (!config) throw new Error("Config not fetched");

      const totalAmount = request.reduce((sum, req) => sum + req.amount, 0);
      if (totalAmount <= 0) return { error: "Invalid amount" };
      const totalAtomicTokenAmount = this.toAtomicAmount(
        totalAmount,
        config.decimals
      );

      // Fetch UTXOs
      logger.update("Fetching UTXOs...");
      const utxos = await this.getUtxos(address);
      const totalUtxoAmount = utxos.reduce(
        (sum, utxo) => sum + (utxo.data.bsv21.amt || 0),
        0
      );

      if (totalUtxoAmount < totalAtomicTokenAmount) {
        return { error: "Insufficient MNEE balance" };
      }

      // Determine fee
      const fee =
        request.find((req) => req.address === config.burnAddress) !== undefined
          ? 0
          : config.fees.find(
              (fee: { min: number; max: number }) =>
                totalAtomicTokenAmount >= fee.min &&
                totalAtomicTokenAmount <= fee.max
            )?.fee;
      if (fee === undefined) return { error: "Fee ranges inadequate" };

      // Build transaction
      const tx = new Transaction(1, [], [], 0);
      let tokensIn = 0;
      const signingAddresses: string[] = [];

      let changeAddress = "";
      while (tokensIn < totalAtomicTokenAmount + fee) {
        const utxo = utxos.shift();
        if (!utxo) return { error: "Insufficient MNEE balance" };

        const sourceTransaction = await this.fetchBeef(utxo.txid);
        if (!sourceTransaction)
          return { error: "Failed to fetch source transaction" };

        signingAddresses.push(utxo.owners[0]);

        changeAddress = changeAddress || utxo.owners[0];
        tx.addInput({
          sourceTXID: utxo.txid,
          sourceOutputIndex: utxo.vout,
          sourceTransaction,
          unlockingScript: new UnlockingScript(),
        });

        tokensIn += utxo.data.bsv21.amt;
      }

      for (const req of request) {
        tx.addOutput(
          this.createInscription(
            req.address,
            this.toAtomicAmount(req.amount, config.decimals),
            config
          )
        );
      }

      if (fee > 0)
        tx.addOutput(this.createInscription(config.feeAddress, fee, config));

      const change = tokensIn - totalAtomicTokenAmount - fee;
      if (change > 0) {
        tx.addOutput(this.createInscription(changeAddress, change, config));
      }

      // Signing transaction
      const sigRequests: SignatureRequest[] = tx.inputs.map((input, index) => {
        if (!input.sourceTXID) throw new Error("Source TXID is undefined");
        return {
          prevTxid: input.sourceTXID,
          outputIndex: input.sourceOutputIndex,
          inputIndex: index,
          address: signingAddresses[index],
          script:
            input.sourceTransaction?.outputs[
              input.sourceOutputIndex
            ].lockingScript.toHex(),
          satoshis:
            input.sourceTransaction?.outputs[input.sourceOutputIndex]
              .satoshis || 1,
          sigHashType:
            TransactionSignature.SIGHASH_ALL |
            TransactionSignature.SIGHASH_ANYONECANPAY |
            TransactionSignature.SIGHASH_FORKID,
        };
      });

      const rawtx = tx.toHex();
      const res = await this.getSignatures({ rawtx, sigRequests }, privateKey);

      if (!res?.sigResponses) return { error: "Failed to get signatures" };

      // Apply signatures
      for (const sigResponse of res.sigResponses) {
        tx.inputs[sigResponse.inputIndex].unlockingScript = new Script()
          .writeBin(Utils.toArray(sigResponse.sig, "hex"))
          .writeBin(Utils.toArray(sigResponse.pubKey, "hex"));
      }

      // Submit transaction using Axios
      logger.update("Getting signatures...");
      const base64Tx = Utils.toBase64(tx.toBinary());
      const response = await axios.post<{ rawtx: string }>(
        `${this.mneeApi}/v1/transfer?auth_token=${this.mneeApiToken}`,
        {
          rawtx: base64Tx,
        }
      );

      if (!response.data.rawtx)
        return { error: "Failed to broadcast transaction" };

      const decodedBase64AsBinary = Utils.toArray(
        response.data.rawtx,
        "base64"
      );
      const tx2 = Transaction.fromBinary(decodedBase64AsBinary);

      logger.update("Broadcasting transaction...");
      await this.broadcast(tx2);

      return { txid: tx2.id("hex"), rawtx: Utils.toHex(decodedBase64AsBinary) };
    } catch (error) {
      let errorMessage = "Transaction submission failed";

      if (axios.isAxiosError(error) && error.response) {
        const { status, data } = error.response;
        if (data?.message) {
          if (status === 423) {
            if (data.message.includes("frozen")) {
              errorMessage =
                "Your address is currently frozen and cannot send tokens";
            } else if (data.message.includes("blacklisted")) {
              errorMessage =
                "The recipient address is blacklisted and cannot receive tokens";
            } else {
              errorMessage =
                "Transaction blocked: Address is either frozen or blacklisted";
            }
          } else if (status === 503) {
            if (data.message.includes("cosigner is paused")) {
              errorMessage =
                "Token transfers are currently paused by the administrator";
            } else errorMessage = "Service temporarily unavailable";
          } else {
            errorMessage = data.message;
          }
        }
      } else {
        errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred";
      }

      console.error("Failed to transfer tokens:", errorMessage);
      return { error: errorMessage };
    }
  };
}
