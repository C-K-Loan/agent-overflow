import { Connection, Commitment } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "./constants";

let _connection: Connection | null = null;

/** Singleton Solana RPC connection */
export function getConnection(commitment: Commitment = "confirmed"): Connection {
  if (!_connection) {
    _connection = new Connection(SOLANA_RPC_URL, { commitment });
  }
  return _connection;
}
