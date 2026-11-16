#!/bin/sh
# Operate only on the stopped Compose project's state volume.
set -eu
umask 077

if [ "$#" -ne 2 ]; then
  echo 'Usage: sh scripts/selfhost-state.sh backup|restore ARCHIVE' >&2
  exit 2
fi

action=$1
archive=$2
running=$(docker compose ps --status running -q open-seo)
if [ -n "$running" ]; then
  echo 'Stop open-seo before copying its database and storage.' >&2
  exit 1
fi

case "$action" in
  backup)
    if [ -e "$archive" ] || [ -L "$archive" ]; then
      echo "Choose a new archive filename." >&2
      exit 1
    fi
    # Refuse a typo in the project name before Compose can create an empty source.
    service=$(docker compose ps --all -q open-seo)
    if [ -z "$service" ]; then
      echo 'No open-seo container exists for this project. Use its original Compose project name.' >&2
      exit 1
    fi
    tmp=$(mktemp "${archive}.XXXXXX")
    trap 'rm -f "$tmp"' EXIT
    docker compose run --rm -T --no-deps --entrypoint sh open-seo -ec '
      test -d /app/.wrangler/state
      tar -C /app/.wrangler -czf - state
    ' > "$tmp"
    tar -tzf "$tmp" > /dev/null
    # An existing backup must survive a repeated command.
    ln "$tmp" "$archive"
    ;;
  restore)
    test -f "$archive"
    tar -tzf "$archive" > /dev/null
    docker compose run --rm -T --no-deps --entrypoint sh open-seo -ec '
      cd /app/.wrangler
      if [ -n "$(ls -A)" ]; then
        echo "Restore needs a new, empty state volume." >&2
        exit 1
      fi
      tar -xzf -
      test -d state
    ' < "$archive"
    ;;
  *)
    echo 'Expected backup or restore.' >&2
    exit 2
    ;;
esac
