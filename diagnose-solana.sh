#!/bin/bash
# diagnose-solana.sh
# Script para diagnosticar problemas de conexão com Solana RPC

echo "=== Diagnóstico de Conexão Solana ==="

RPC_URL="https://long-solitary-pallet.solana-devnet.quiknode.pro/26ec12e277e25a0fcbafe9efa9b67383ad7ed0e8/"

echo "RPC em uso: $RPC_URL"
echo "Timestamp: $(date)"

echo -e "\n=== Teste 1: Conectividade Básica ==="
echo "Testando ping para o domínio..."
ping -c 3 long-solitary-pallet.solana-devnet.quiknode.pro

echo -e "\n=== Teste 2: Teste HTTP Direto ==="
echo "Testando conectividade HTTP com curl..."
curl_output=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\n" \
  -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  --max-time 10)

echo "$curl_output"

echo -e "\n=== Teste 3: Comandos Solana Básicos ==="
echo "Testando comando básico (epoch-info)..."
timeout 15s solana epoch-info

echo -e "\nTestando comando de saldo..."
timeout 15s solana balance

echo -e "\nTestando comando de cluster info..."
timeout 15s solana cluster-version

echo -e "\n=== Teste 4: Testando Comando Específico ==="
echo "Testando program show com um programa específico..."
timeout 15s solana program show TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA

echo -e "\n=== Teste 5: Alternativas para Listar Programas ==="
echo "Tentando listar programas da conta..."
timeout 15s solana account $(solana-keygen pubkey ~/.config/solana/id.json) --output json

echo -e "\n=== Teste 6: Verificando Configurações de Rede ==="
echo "Verificando configurações de timeout..."
echo "Timeout padrão do sistema:"
# Verificar se há configurações de timeout
if [ -f ~/.config/solana/cli/config.yml ]; then
    echo "Arquivo de configuração encontrado:"
    cat ~/.config/solana/cli/config.yml
fi

echo -e "\n=== Teste 7: RPC Alternativo ==="
echo "Testando com RPC público para comparação..."
temp_rpc="https://api.devnet.solana.com"
echo "Testando: $temp_rpc"

curl_alt=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\n" \
  -X POST "$temp_rpc" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  --max-time 10)

echo "$curl_alt"

echo -e "\n=== Resumo dos Testes ==="
echo "1. Se ping funciona mas curl falha: Problema de firewall/proxy"
echo "2. Se comandos básicos funcionam mas --programs falha: Problema específico do comando"
echo "3. Se RPC alternativo funciona: Problema com seu RPC privado"
echo "4. Se nada funciona: Problema de rede local"

echo -e "\n=== Soluções Recomendadas ==="
echo "Baseado nos resultados acima, tente:"
echo "1. Configurar timeout maior: export SOLANA_RPC_TIMEOUT=30"
echo "2. Usar RPC público temporariamente"
echo "3. Verificar firewall/antivírus"
echo "4. Tentar em rede diferente (mobile hotspot)"