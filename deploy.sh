#!/bin/bash

deployPath="$HOME/home/dev/web/portfolio-projects/front/astro/portfolioSite/public/installer"
installerDir="$HOME/home/scripts/installer";

dropperName="dropper";
installerName="installer";

mkdir -p $deployPath

# encrypt the installer script
openssl enc -aes-256-cbc \
-in "${installerDir}/${installerName}.ts" \
-out "${deployPath}/${installerName}.enc"

# dropper
cp "${installerDir}/${dropperName}.sh" \
"${deployPath}/${dropperName}.sh"

# todo: push changes to github
