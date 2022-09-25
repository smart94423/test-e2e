// https://stackoverflow.com/questions/34570452/node-js-stdout-clearline-and-cursorto-functions#comment80319576_34570694
export const isTTY: boolean = !!process.stdout.clearLine
