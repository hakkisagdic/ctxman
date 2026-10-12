/**
 * Command-line output helpers
 */

/**
 * End the process quietly when the reader of stdout goes away (`ctxman pr | head`): the
 * rest of the output has nowhere to go, and Node's default is an unhandled EPIPE error.
 * @param {import('stream').Writable} [stream=process.stdout]
 */
export function exitOnBrokenPipe(stream = process.stdout) {
  stream.on('error', (error) => {
    if (error.code === 'EPIPE') process.exit(0);
    throw error;
  });
}

export default exitOnBrokenPipe;
