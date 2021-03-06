/* eslint-env node */

require('v8-compile-cache')

const updateNotifier = require('update-notifier')
const pkg = require('./package.json')
updateNotifier({ pkg }).notify()

if (!require('at-least-node')('14.8.0')) {
  console.error(
    'You are running Node ' +
      process.versions.node +
      '.\n' +
      'Create Carv requires Node 14.8 or higher. \n' +
      'Please update your version of Node.',
  )

  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1)
}

const fs = require('fs')
const path = require('path')
const findUp = require('find-up').sync

// Ensure binaries from installed packages are available as scripts
const managePath = require('manage-path')
const alterPath = managePath(process.env)
const npmBin = findUp('node_modules/.bin', { cwd: __dirname, type: 'directory' })
if (npmBin) {
  alterPath.unshift(npmBin)
}

const projectRoot = require('project-root-directory')
alterPath.unshift(path.resolve(projectRoot, 'node_modules', '.bin'))

const paths = require('./lib/package-paths')
alterPath.unshift(path.resolve(paths.root, 'node_modules', '.bin'))

const use = require('./lib/package-use')

const extensions = ['.js', '.jsx', '.cjs', '.mjs']
if (use.typescript) extensions.push('.ts', '.tsx')

const gitignoreFile = require('find-up').sync('.gitignore', { cwd: paths.root })
const ignorePath = gitignoreFile && `--ignore-path ${path.relative(process.cwd(), gitignoreFile)}`

const eslint = [`eslint`, ignorePath, `--ext ${extensions.join(',')}`, `.`]
  .filter(Boolean)
  .join(' ')

const prettier = [`prettier`, ignorePath].filter(Boolean).join(' ')

const jest = `jest --passWithNoTests`

const rollupConfig = fs.existsSync(path.join(paths.root, 'rollup.config.mjs'))
  ? path.join(paths.root, 'rollup.config.mjs')
  : fs.existsSync(path.join(paths.root, 'rollup.config.cjs'))
  ? path.join(paths.root, 'rollup.config.cjs')
  : fs.existsSync(path.join(paths.root, 'rollup.config.js'))
  ? path.join(paths.root, 'rollup.config.js')
  : tryResolve('@carv/scripts/rollup/config.cjs')

const rollup = rollupConfig && `rollup --config ${path.relative(process.cwd(), rollupConfig)}`

exports.scripts = {
  // Main entrypoints
  default: `nps ${process.env.npm_lifecycle_event || 'start'}`,

  start: use.svelte ? 'nps build.watch' : 'nps test',

  test: {
    default: [
      'nps',
      'prepare',
      use.typescriptGraphql && 'graphql.validate',
      'test.check',
      'jest.coverage',
    ]
      .filter(Boolean)
      .join(' '),
    coverage: 'nps jest.coverage',
    watch: 'nps jest.watch',
    check: ['nps', 'eslint', use.typescript && 'tsc', use.svelte && 'svelte-check']
      .filter(Boolean)
      .join(' '),
  },

  prepare: ['nps', 'cleanup', use.typescriptGraphql && 'graphql.typegen'].filter(Boolean).join(' '),

  ci: ['nps', 'prepare', use.typescriptGraphql && 'graphql.validate', 'test.check', 'jest.ci']
    .filter(Boolean)
    .join(' '),

  build: {
    default: ['nps', 'prepare', 'build.package'].join(' '),
    package: rollup || 'esbundle',
    watch: rollup ? `${rollup} --watch` : 'esbundle --watch',
  },

  prepublishOnly: 'nps build.package',
  version: 'nps prettier.docs',
  docs: {
    default: 'nps cleanup.docs docs.package',
    package: 'nps doctoc.readme prettier.docs',
  },

  release: {
    default: {
      script: 'nps test build.package release.publish',
      description: 'create a release',
    },
    publish: {
      script: 'npm publish ./dist',
      hiddenFromHelp: true,
    },
  },

  format: {
    default: ['nps', 'format.package', 'prettier.write', 'eslint.fix'].join(' '),
    package: ['nps', 'doctoc.readme', use.typescriptGraphql && 'graphql.typegen']
      .filter(Boolean)
      .join(' '),
  },

  envinfo: 'envinfo --system --browsers --IDEs --binary --npmPackages',

  cleanup: {
    default:
      'rimraf ' +
      [paths.build, paths.dist, path.join(paths.source, '**', '__generated__')]
        .map((p) => path.relative(process.cwd(), p))
        .join(' '),
    docs: `rimraf ${path.relative(process.cwd(), paths.docs)}`,
  },

  // Tools
  eslint: {
    default: eslint,
    fix: `${eslint} --fix`,
  },

  prettier: {
    check: `${prettier} --check .`,
    write: `${prettier} --write .`,
    docs: [
      `${prettier} --write`,
      fs.existsSync(path.join(paths.root, 'README.md')) &&
        path.relative(process.cwd(), path.join(paths.root, 'README.md')),
      fs.existsSync(path.join(paths.root, 'CHANGELOG.md')) &&
        path.relative(process.cwd(), path.join(paths.root, 'CHANGELOG.md')),
    ]
      .filter(Boolean)
      .join(' '),
  },

  jest: {
    default: `${jest}`,
    coverage: `${jest} --coverage --no-cache`,
    watch: `${jest} --watchAll`,
    ci: `${jest} --ci --coverage --maxWorkers=2`,
  },

  doctoc: {
    readme: 'doctoc --github --notitle --maxlevel 2 README.md',
  },
}

if (use.svelte) {
  exports.scripts['svelte-check'] = `svelte-check --ignore '**/node_modules,**/docs'`
}

if (use.typescript) {
  const tsc = `tsc --project ${path.relative(process.cwd(), paths.typescriptConfig)} --noEmit`

  exports.scripts.tsc = {
    default: tsc,
    watch: `${tsc} --watch`,
  }

  const manifest = require('./lib/package-manifest')

  const { typedocOptions = {} } = require(paths.typescriptConfig)

  try {
    exports.scripts.typedoc = [
      'typedoc',
      '--name',
      JSON.stringify(typedocOptions.name || `${manifest.name} - v${manifest.version}`),
      '--readme',
      path.relative(process.cwd(), path.join(paths.root, 'README.md')),
      '--excludeExternals',
      // Output directory
      '--out',
      paths.isMonorepo
        ? path.relative(
            process.cwd(),
            path.join(paths.docs, path.relative(paths.projectRoot, paths.root)),
          )
        : path.relative(process.cwd(), paths.docs),
      // Entry Point
      typedocOptions.entryPoints
        ? null
        : path.relative(process.cwd(), require('./lib/get-input-file')()),
    ]
      .filter(Boolean)
      .join(' ')

    exports.scripts.docs.package += ' typedoc'
  } catch {
    /* Ignore */
  }
}

if (use.typescriptGraphql) {
  exports.scripts.graphql = {
    typegen: 'ts-graphql-plugin typegen',
    validate: 'ts-graphql-plugin validate',
    report: 'ts-graphql-plugin report',
  }
}

function tryResolve(id) {
  try {
    return require.resolve(id)
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return
    }

    throw error
  }
}
