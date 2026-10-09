#!/bin/bash

INSTALL_DIR="/usr/lib/pickaxe"
CLI_DIR="$INSTALL_DIR/resources/app/static"
CLI_INSTALL_TARGET="/usr/bin/pickaxe-cli"

# add executable permissions for CLI interface
chmod +x "$CLI_DIR"/pickaxe-cli || :

# create symbolic links to /usr/bin directory
ln -f -s "$CLI_DIR"/pickaxe-cli "$CLI_INSTALL_TARGET" || :

exit 0
