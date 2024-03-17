import fs from "node:fs";

const process = Deno;

// --------------------------------------------------------------------
// ------------------------------ CONFIGURATION -----------------------
// --------------------------------------------------------------------

const config = {
  dryRun: true,
  user: {
    name: 'venego'
  },
  path: {
    log: "postInstallation.log",
  },
};

// --------------------------------------------------------------------
// ---------------------------- UTILITIES -----------------------------
// --------------------------------------------------------------------

interface Print {
  title: (msg: string) => void,
  error: (msg: string) => void,
  success: (msg: string) => void,
  info: (msg: string) => void,
}
const print: Print = {
  title: (msg: string) => {
    console.log(`\x1b[33m${msg}\x1b[0m`);
  },
  error: (msg: string) => {
    console.log(`\x1b[31m${msg}\x1b[0m`);
  },
  success: (msg: string) => {
    console.log(`\x1b[32m${msg}\x1b[0m`);
  },
  info: (msg: string) => {
    console.log(`\x1b[34m${msg}\x1b[0m`);
  },
};

const logVars = {
  logSessionMarked: false,
};
const log = ({
  orderStr,
  title,
  msg,
  printToConsole = true,
}: {
  orderStr: string;
  title: string;
  msg: string;
  printToConsole?: true;
}) => {
  // mark beginning of an installation
  if (!logVars.logSessionMarked) {
    fs.appendFileSync(
      config.path.log,
      `\n-----------------------------------------------------------------------------------------------
       \n------------------->> ${new Date().toISOString()} - installation start <<----------------------\n
        ------------------------------------------------------------------------------------------------\n`
    );
    logVars.logSessionMarked = true;
  }

  if (printToConsole) {
    print.error(msg);
  }
  fs.appendFileSync(
    config.path.log,
    `\n------------------->> ${new Date().toISOString()} - ${orderStr}\n${title}\n${msg}\n<<----------------------\n`
  );
};

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t));

const command = (cmd: string, printOutput: boolean = false) => {
  const output = new process.Command("bash", { args: ["-c", cmd] }).outputSync();

  const decoder = new TextDecoder();
  const stderr = decoder.decode(output.stderr);
  const stdout = decoder.decode(output.stdout);

  if (printOutput) {
    console.log("stdout:", stdout);
  }

  if (stderr) {
    //* some warnings are outputed as errors.
    const falsePositives = ["warning"];
    if (
      falsePositives.some((item) =>
        stderr.toLowerCase().includes(item.toLocaleLowerCase())
      )
    ) {
      console.log("IMPORTANT (I guess) => " + stderr);
      return;
    }

    throw Error(stderr);
  }
};

interface EnvVars {
  driveAttached: boolean,
  driveMounted: boolean,
  internetAvailable: boolean,
}
const envVars: EnvVars = {
  driveAttached: true,
  driveMounted: true,
  internetAvailable: true,
}
const checkEnv = () => {
  // do some checks here
  return {
    allSet: true,
    env: envVars
  }
};

const loadEnv = () => {
  print.info("checking environment...");
  if (!checkEnv().allSet) {
    // setup env here
  }

  const env = checkEnv();
  if (!env.allSet) {
    return env;
  }

  return env;
}

// ------------------------------------------------------------------
// ----------------------------- STEPS ------------------------------
// ------------------------------------------------------------------

type Steps = {
  enabled?: boolean;
  title: string;
  substeps: {
    enabled?: boolean;
    title?: string;
    cmd?: string[];
    apps?: string[];
  }[];
};
const steps: Steps[] = [
  {
    title: "Wrapper for apt, a better way of installing packages.",
    substeps: [
      {
        apps: ["nala"],
      },
    ],
  },
  // add more steps here
];

// these are printed after post-installation
const manualSteps = [
  "do some manual step that you can't automate",
];

// --------------------------------------------------------------------
// ------------------------- INSTALLATION RUN -------------------------
// --------------------------------------------------------------------

async function runSteps() {
  const stepsList = steps;
  for (let stepIndex = 0; stepIndex < stepsList.length; stepIndex++) {
    const step = stepsList[stepIndex];

    if (step.enabled === false) {
      continue;
    }

    console.log(""); //* don't remove
    print.title(
      `================ ${stepIndex + 1} / ${stepsList.length} - ${step.title ? step.title : "untitled step"} =====================`
    );
    // print[step.enabled === false ? 'info': 'title']('==================================================================')

    const substepsList = step.substeps;
    for (
      let substepIndex = 0;
      substepIndex < substepsList.length;
      substepIndex++
    ) {
      const substep = substepsList[substepIndex];

      if (substep.enabled === false) {
        continue;
      }

      print.title(
        `${substepIndex + 1} / ${substepsList.length} - ${substep.title ?? "untitled substep"
        }`
      );

      if (substep.apps) {
        for (let appIndex = 0; appIndex < substep.apps.length; appIndex++) {
          const appsList = substep.apps;
          const app = substep.apps[appIndex];

          print.title(`${appIndex + 1} / ${appsList.length} - [app] ${app}`);
          if (!config.dryRun) {
            try {
              command(`sudo apt install ${app} -y`);
            } catch (err) {
              log({
                orderStr: `${appIndex + 1} / ${appsList.length}`,
                title: `[app] ${app}`,
                msg: `${err}`,
              });
            }
          }
        }
        continue;
      }

      const cmdList = substep.cmd;
      if (!config.dryRun && Array.isArray(cmdList)) {
        for (let cmdIndex = 0; cmdIndex < cmdList.length; cmdIndex++) {
          const cmd = cmdList[cmdIndex];

          try {
            print.title(
              `${cmdIndex + 1} / ${cmdList.length} - [cmd] "${cmd.slice(
                0,
                21
              )}..."`
            );
            command(cmd);
          } catch (err) {
            log({
              orderStr: `${stepIndex + 1}.${substepIndex + 1}.${cmdIndex + 1}/${stepsList.length
                }.${substepsList.length}.${cmdList.length}`,
              title: `running ${cmd}`,
              msg: `${err}`,
            });
          }
        }
      }
    }
  }

  console.log();
  print.title("======== Manual Steps ===========");
  manualSteps.forEach((step, index) => {
    if (typeof step == "string") {
      print.title(`${index + 1}) ${step}`);
      return;
    }
  });
}

// ---------------------------------------------------------------
// ------------------------- HANDLE ARGS -------------------------
// ---------------------------------------------------------------

const args = {
  length: process.args.length,
  option: process.args[0],
  //? args should be like "node thing.js option argKey:argValue"
  optionArgs: process.args
    .slice(1)
    .reduce((accumulator: {}, optionArg: string) => {
      const optionArgTupal = optionArg.split("=");
      accumulator = { ...accumulator, [optionArgTupal[0]]: optionArgTupal[1] };
      return accumulator;
    }, {}),
};

const main = async () => {
  if (args.length) {
    const options: { [key: string]: (args: any) => any } = {
      // list steps
      list: ({ includeDisabled }: { includeDisabled: string }) => {
        // console.log({ includeDisabled: Boolean(includeDisabled) })
        let stepsList = steps;
        if (!Number(includeDisabled)) {
          stepsList = steps.filter((step) => step.enabled !== false);
        }
        stepsList.forEach((step, stepIndex, list) => {
          print[step.enabled === false ? "error" : "title"](
            `${stepIndex + 1} / ${list.length} - ${step.title
            }`
          );
        });
      },
      // TODO: add other options
    };

    if (options?.[args.option]) {
      // console.log(args.optionArgs)
      options[args.option](args.optionArgs);
    }
    return;
  }

  // the default action: when no arguments were passed

  print.info("setting up environment...");
  const env = loadEnv();
  console.log(env);
  if (!env.allSet) {
    print.error(`The environment wasn't setup`)
    process.exit(1);
  }

  await runSteps();
};

// ----------------- ENTRY POINT
await main();