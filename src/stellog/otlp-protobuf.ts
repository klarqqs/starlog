type Field =
  | { id: number; kind: 'varint'; value: bigint }
  | { id: number; kind: 'fixed64'; value: bigint }
  | { id: number; kind: 'bytes'; value: Uint8Array };

type Attr = { key: string; value: Record<string, string | number | boolean> };

/** Turn an OTLP protobuf body into the JSON shape the extractor already reads. */
export function otlpProtobufToJson(
  signal: 'metrics' | 'traces' | 'logs',
  bytes: Uint8Array,
): unknown {
  const fields = readFields(bytes);
  if (signal === 'traces')
    return { resourceSpans: fields.filter(field => field.id === 1).map(resourceSpans) };
  if (signal === 'metrics')
    return { resourceMetrics: fields.filter(field => field.id === 1).map(resourceMetrics) };
  return { resourceLogs: fields.filter(field => field.id === 1).map(resourceLogs) };
}

function resourceSpans(field: Field) {
  const fields = message(field);
  return {
    resource: resource(first(fields, 1)),
    scopeSpans: fields.filter(item => item.id === 2).map(scopeSpans),
  };
}

function scopeSpans(field: Field) {
  const fields = message(field);
  return { spans: fields.filter(item => item.id === 2).map(span) };
}

function span(field: Field) {
  const fields = message(field);
  return {
    startTimeUnixNano: fixedString(fields, 7),
    endTimeUnixNano: fixedString(fields, 8),
    attributes: attributes(fields, 9),
  };
}

function resourceMetrics(field: Field) {
  const fields = message(field);
  return {
    resource: resource(first(fields, 1)),
    scopeMetrics: fields.filter(item => item.id === 2).map(scopeMetrics),
  };
}

function scopeMetrics(field: Field) {
  const fields = message(field);
  return { metrics: fields.filter(item => item.id === 2).map(metric) };
}

function metric(field: Field) {
  const fields = message(field);
  const name = text(fields, 1) ?? '';
  const unit = text(fields, 3) ?? '';
  const sum = first(fields, 7) ?? first(fields, 5);
  const histogram = first(fields, 9) ?? first(fields, 6);
  const body: Record<string, unknown> = { name, unit };
  if (sum) body.sum = numberSeries(message(sum));
  if (histogram) body.histogram = histogramSeries(message(histogram));
  return body;
}

function numberSeries(fields: Field[]) {
  return {
    aggregationTemporality: Number(varint(fields, 2) ?? 0n),
    dataPoints: fields.filter(field => field.id === 1).map(numberPoint),
  };
}

function numberPoint(field: Field) {
  const fields = message(field);
  const asInt = fixed(fields, 6) ?? varint(fields, 5);
  return {
    attributes: [...attributes(fields, 7), ...attributes(fields, 1)],
    timeUnixNano: fixedString(fields, 3),
    ...(asInt === undefined ? { asDouble: fixedDouble(fields, 4) } : { asInt: asInt.toString() }),
  };
}

function histogramSeries(fields: Field[]) {
  return {
    aggregationTemporality: Number(varint(fields, 2) ?? 0n),
    dataPoints: fields.filter(field => field.id === 1).map(histogramPoint),
  };
}

function histogramPoint(field: Field) {
  const fields = message(field);
  return {
    attributes: [...attributes(fields, 9), ...attributes(fields, 1)],
    timeUnixNano: fixedString(fields, 3),
    count: (fixed(fields, 4) ?? varint(fields, 4) ?? 0n).toString(),
    sum: fixedDouble(fields, 5),
    bucketCounts: packedFixed(fields, 6).map(value => value.toString()),
    explicitBounds: packedDoubles(fields, 7),
  };
}

function resourceLogs(field: Field) {
  const fields = message(field);
  return {
    resource: resource(first(fields, 1)),
    scopeLogs: fields.filter(item => item.id === 2).map(() => ({ logRecords: [] })),
  };
}

function resource(field: Field | undefined) {
  if (!field) return { attributes: [] };
  return { attributes: attributes(message(field), 1) };
}

function attributes(fields: Field[], id: number): Attr[] {
  return fields.filter(field => field.id === id).map(field => keyValue(message(field)));
}

function keyValue(fields: Field[]): Attr {
  const value = first(fields, 2);
  return { key: text(fields, 1) ?? '', value: value ? anyValue(message(value)) : {} };
}

function anyValue(fields: Field[]): Record<string, string | number | boolean> {
  const stringValue = text(fields, 1);
  if (stringValue !== undefined) return { stringValue };
  const boolValue = varint(fields, 2);
  if (boolValue !== undefined) return { boolValue: boolValue === 1n };
  const intValue = varint(fields, 3);
  if (intValue !== undefined) return { intValue: intValue.toString() };
  const doubleValue = fixedDouble(fields, 4);
  if (doubleValue !== undefined) return { doubleValue };
  return {};
}

function message(field: Field): Field[] {
  if (field.kind !== 'bytes') throw new Error('OTLP protobuf field is not a message.');
  return readFields(field.value);
}

function first(fields: Field[], id: number) {
  return fields.find(field => field.id === id);
}

function bytesOf(fields: Field[], id: number) {
  const field = first(fields, id);
  return field?.kind === 'bytes' ? field.value : undefined;
}

function text(fields: Field[], id: number) {
  const value = bytesOf(fields, id);
  return value ? new TextDecoder().decode(value) : undefined;
}

function varint(fields: Field[], id: number) {
  const field = first(fields, id);
  return field?.kind === 'varint' ? field.value : undefined;
}

function fixed(fields: Field[], id: number) {
  const field = first(fields, id);
  return field?.kind === 'fixed64' ? field.value : undefined;
}

function fixedString(fields: Field[], id: number) {
  const field = first(fields, id);
  return field?.kind === 'fixed64' ? field.value.toString() : '0';
}

function fixedDouble(fields: Field[], id: number) {
  const value = fixed(fields, id);
  if (value === undefined) return undefined;
  const bytes = fixedBytes(value);
  return new DataView(bytes.buffer).getFloat64(0, true);
}

function packedFixed(fields: Field[], id: number) {
  const value = bytesOf(fields, id);
  if (!value) return [];
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  const values: bigint[] = [];
  for (let offset = 0; offset + 8 <= value.byteLength; offset += 8) {
    const packed =
      BigInt(view.getUint32(offset, true)) + (BigInt(view.getUint32(offset + 4, true)) << 32n);
    values.push(packed);
  }
  return values;
}

function packedDoubles(fields: Field[], id: number) {
  const value = bytesOf(fields, id);
  if (!value) return [];
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  const values: number[] = [];
  for (let offset = 0; offset + 8 <= value.byteLength; offset += 8) {
    values.push(view.getFloat64(offset, true));
  }
  return values;
}

function fixedBytes(value: bigint) {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Number(value & 0xffffffffn), true);
  view.setUint32(4, Number((value >> 32n) & 0xffffffffn), true);
  return bytes;
}

function readFields(buf: Uint8Array): Field[] {
  const fields: Field[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const tag = readVarint(buf, offset);
    offset = tag.next;
    const id = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (wire === 0) {
      const value = readVarint(buf, offset);
      offset = value.next;
      fields.push({ id, kind: 'varint', value: value.value });
    } else if (wire === 1) {
      if (offset + 8 > buf.length) throw new Error('Truncated OTLP protobuf.');
      const view = new DataView(buf.buffer, buf.byteOffset + offset, 8);
      const value = BigInt(view.getUint32(0, true)) + (BigInt(view.getUint32(4, true)) << 32n);
      offset += 8;
      fields.push({ id, kind: 'fixed64', value });
    } else if (wire === 2) {
      const length = readVarint(buf, offset);
      offset = length.next;
      const size = Number(length.value);
      if (offset + size > buf.length) throw new Error('Truncated OTLP protobuf.');
      fields.push({ id, kind: 'bytes', value: buf.subarray(offset, offset + size) });
      offset += size;
    } else if (wire === 5) {
      offset += 4;
    } else {
      throw new Error('Unsupported OTLP protobuf wire type.');
    }
  }
  return fields;
}

function readVarint(buf: Uint8Array, offset: number) {
  let value = 0n;
  let shift = 0n;
  let cursor = offset;
  while (cursor < buf.length) {
    const byte = buf[cursor];
    cursor += 1;
    value += BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, next: cursor };
    shift += 7n;
    if (shift > 70n) break;
  }
  throw new Error('Truncated OTLP protobuf.');
}
