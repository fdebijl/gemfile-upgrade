// NOTE: vscode is imported lazily in initLogger to allow this module to be
// imported in Node.js tests without failing on the vscode module resolution.
let channel: import('vscode').LogOutputChannel | undefined

export function initLogger(context: import('vscode').ExtensionContext) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscode = require('vscode') as typeof import('vscode')
  channel = vscode.window.createOutputChannel('Gemfile Upgrade', { log: true })
  context.subscriptions.push(channel)
}

export function logError(message: string, caughtError?: unknown) {
  log('error', message, caughtError)
}

function log(type: 'debug' | 'error', message?: string, caughtError?: unknown) {
  if (!channel) {
    return
  }
  if (message !== undefined) {
    channel[type](message)
  }
  if (caughtError !== undefined) {
    if (caughtError instanceof Error) {
      channel[type](`Caught error: ${caughtError.name}:${caughtError.message}`)
      channel[type](caughtError.stack ?? 'no stack')
    } else {
      channel[type](`caught non error: ${JSON.stringify(caughtError)}`)
    }
  }
  if (type === 'error') {
    channel.show(true)
  }
}
