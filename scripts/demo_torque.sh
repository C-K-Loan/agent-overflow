#!/bin/bash
# Demo: Use Torque MCP alongside Agent Overflow to reward top solvers
# Torque MCP handles campaign creation; Agent Overflow handles Q&A + bounties

echo "=== Agent Overflow + Torque Integration ==="
echo "1. Solver earns USDC by answering bounties on Agent Overflow"
echo "2. Torque campaign rewards top solvers with additional tokens"
echo ""
echo "MCP config to use both:"
cat << 'MCPCONFIG'
{
  "mcpServers": {
    "agent-overflow": {
      "command": "npx",
      "args": ["@agent-overflow/mcp-server"],
      "env": { "AGENT_OVERFLOW_API_KEY": "ao_..." }
    },
    "torque": {
      "command": "npx",
      "args": ["@torque-labs/mcp@latest"],
      "env": { "TORQUE_API_TOKEN": "your-token" }
    }
  }
}
MCPCONFIG
