#!/bin/sh
# Gera SimulaPro-hostinger.zip para enviar ao public_html da Hostinger.
# Uso: sh simulapro/gerar-zip.sh [arquivo-de-saida.zip]
set -e
AQUI=$(cd "$(dirname "$0")" && pwd)
SAIDA=$(realpath -m "${1:-SimulaPro-hostinger.zip}")
TMP=$(mktemp -d)
mkdir -p "$TMP/SimulaPro" "$TMP/simulapro"
(cd "$AQUI" && tar cf - --exclude=./redirecionar-minusculas --exclude=./README.md \
  --exclude=./gerar-zip.sh --exclude=./config.exemplo.php --exclude=./.gitignore \
  --exclude=./_dados --exclude=./api/_dados --exclude=./api/config.php --exclude='*.zip' .) | (cd "$TMP/SimulaPro" && tar xf -)
cp -a "$AQUI/redirecionar-minusculas/." "$TMP/simulapro/"
rm -f "$SAIDA"
(cd "$TMP" && zip -qr "$SAIDA" SimulaPro simulapro)
rm -rf "$TMP"
echo "Pronto: $SAIDA"
