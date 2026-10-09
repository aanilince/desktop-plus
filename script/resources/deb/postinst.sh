#!/bin/bash

set -e

PROFILE_D_FILE="/etc/profile.d/pickaxe.sh"
INSTALL_DIR="/usr/lib/pickaxe"
CLI_DIR="$INSTALL_DIR/resources/app/static"
CLI_INSTALL_TARGET="/usr/bin/pickaxe-cli"

case "$1" in
    configure)
      # add executable permissions for CLI interface
      chmod +x "$CLI_DIR"/pickaxe-cli || :
      # check if this is a dev install or standard
      if [ -f "$INSTALL_DIR/pickaxe-dev" ]; then
	      BINARY_NAME="pickaxe-dev"
      else
	      BINARY_NAME="pickaxe"
      fi
      # create symbolic links to /usr/bin directory
      ln -f -s "$INSTALL_DIR"/$BINARY_NAME /usr/bin || :
      ln -f -s "$CLI_DIR"/pickaxe-cli "$CLI_INSTALL_TARGET" || :
    ;;

    abort-upgrade|abort-remove|abort-deconfigure)
    ;;

    *)
      echo "postinst called with unknown argument \`$1'" >&2
      exit 1
    ;;
esac

exit 0
