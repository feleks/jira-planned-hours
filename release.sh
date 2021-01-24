#!/bin/sh

# npm --no-git-tag-version version $1 && \
npm version $1 && \
git add --all && \
git commit --amend --no-edit
