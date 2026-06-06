export function stripUndefinedDeep(value) {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefinedDeep(item)]),
    );
  }
  return value;
}

export function assertNoUndefinedDeep(value, path = 'payload') {
  if (value === undefined) throw new Error(`${path} contains undefined`);
  if (Array.isArray(value)) value.forEach((item, index) => assertNoUndefinedDeep(item, `${path}[${index}]`));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => assertNoUndefinedDeep(item, `${path}.${key}`));
}
