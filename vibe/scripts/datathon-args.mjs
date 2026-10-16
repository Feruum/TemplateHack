import path from 'node:path'

export function normalizeDatathonArguments(raw, cwd) {
  const values = raw[0] === '--' ? raw.slice(1) : raw
  const flags = ['--data', '--predict', '--output']
  const result = []
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    const equalsFlag = flags.find(flag => value.startsWith(`${flag}=`))
    if (equalsFlag) result.push(equalsFlag, path.resolve(cwd, value.slice(equalsFlag.length + 1)))
    else if (flags.includes(value) && values[index + 1]) result.push(value, path.resolve(cwd, values[++index]))
    else result.push(value)
  }
  return result
}
