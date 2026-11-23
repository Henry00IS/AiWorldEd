/**
 * Longest wait for the browser to answer a call on a stored file system handle,
 * in milliseconds. A stale handle may never answer, and menus and dialogs wait
 * on it.
 */
export const FILE_SYSTEM_HANDLE_ANSWER_MS = 1000;

/**
 * Waits for the browser to answer a call on a stored file system handle (a
 * permission check, a read, a comparison), failing when it does not answer in
 * time. Not for permission requests: those wait for the user.
 *
 * @param call Pending browser call.
 * @returns The answer.
 */
export async function fileSystemHandleAnswer<T>(call: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new DOMException('The browser did not answer for a stored file handle', 'TimeoutError')),
      FILE_SYSTEM_HANDLE_ANSWER_MS,
    );
  });
  try {
    return await Promise.race([call, late]);
  } finally {
    clearTimeout(timer);
  }
}
