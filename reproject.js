const fs = require('fs');
const childProcess = require('child_process');

function getGitRevision() {
  const proc = childProcess.spawn('git', ['rev-list', '--count', 'HEAD']);
  const stdoutBuffers = [];
  return new Promise((resolve, reject) => {
    proc.stdout.on('data', (data) => {
      stdoutBuffers.push(data);
    });

    proc.stderr.on('data', (data) => {
      console.error(data.toString('utf8'));
    });

    proc.on('exit', (code) => {
      if (code) {
        reject(new Error('exit code = ' + code));
      }
      resolve(Buffer.concat(stdoutBuffers).toString('utf8').trim());
    });
  });
}

function getPackageJson() {
  return new Promise((resolve, reject) => {
    fs.readFile('package.in.json', (err, data) => {
      if (err) {
        reject(err);
        return ;
      }
      resolve(JSON.parse(data.toString('utf8')));
    });
  });
}

function writePackageJson(data) {
  return new Promise((resolve, reject) => {
    fs.writeFile('package.json', Buffer.from(data), (err) => {
      if (err) {
        reject(err);
        return ;
      }
      resolve();
    });
  });
}

function getProjectInfo() {
  const info = {
    THIS: {
      gitrevision: ''
    }
  };
  return getGitRevision()
    .then(v => info.THIS.gitrevision = v)
    .then(() => info);
}

const REGEX_PROJECT_NAME_FROM_GIT_URL = /^.*\/([^.]+)\.git/;

function stringReplacer(projectInfo, input) {
  return input.replace(/\${([^:]+):([^}]+)}/g, (match, optType, optName, offset, input) => {
    const optTypeUpper = optType.toUpperCase();
    if (optTypeUpper === 'ENV') {
      return process.env[optName];
    }else{
      return projectInfo[optTypeUpper] && projectInfo[optTypeUpper][optName.toLowerCase()];
    }
  });
}

function objectReplacer(projectInfo, target) {
  Object.keys(target)
    .forEach(key => {
      const cur = target[key];
      if (typeof cur === 'string') {
        target[key] = stringReplacer(projectInfo, target[key]);
      }else if(typeof cur === 'object') {
        objectReplacer(projectInfo, cur);
      }
    });
}

Promise.all([
  getProjectInfo(), getPackageJson()
])
  .then(([projectInfo, packageJson]) => {
    const pbrepo = packageJson.pbrepo;
    const projectName = process.env.PROJECT_NAME || process.env.JOB_NAME;
    packageJson.name = projectName;

    Object.keys(packageJson.scripts)
      .forEach(key => packageJson.scripts[key] = stringReplacer(projectInfo, packageJson.scripts[key]));

    objectReplacer(projectInfo, pbrepo);

    Object.keys(pbrepo)
      .forEach(key => {
        packageJson[key] = pbrepo[key];
      });

    return writePackageJson(JSON.stringify(packageJson, null, 2));
  });
