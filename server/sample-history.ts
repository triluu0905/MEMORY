type RecordValue = Record<string, unknown>;
export type FieldChange = { field: string; before: string; after: string };
export type SampleChange = { sampleId: string; sampleCode: string; type: 'created' | 'edited' | 'deleted'; changes: FieldChange[] };

function object(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}; }
function list(value: unknown): RecordValue[] { return Array.isArray(value) ? value.map(object) : []; }
function value(input: unknown): string {
  if (input == null || input === '') return '';
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') return String(input);
  return JSON.stringify(input);
}
function namedFile(input: unknown): string { return value(object(input).name); }
function quantity(input: unknown): string { const q = object(input); return [value(q.v), value(q.u)].filter(Boolean).join(' '); }
function fields(sample: RecordValue): Map<string, string> {
  const result = new Map<string, string>();
  result.set('Mã mẫu', value(sample.code));
  list(sample.steps).forEach((step, index) => {
    const prefix = `Bước ${index + 1} · `;
    const add = (label: string, content: unknown) => result.set(prefix + label, value(content));
    add('Ngày thực hiện', step.date);
    add('Quy trình', step.procText);
    add('Tệp quy trình', namedFile(step.procFile));
    list(step.chems).forEach((chem, chemIndex) => {
      const name = `Hóa chất ${chemIndex + 1}`;
      add(name, chem.name);
      add(`${name} · Định lượng`, chem.amount == null || chem.amount === '' ? '' : [value(chem.amount), value(chem.unit)].filter(Boolean).join(' '));
      const concentration = object(object(step.cond).conc)[value(chem.id)];
      add(`${name} · Nồng độ`, quantity(concentration));
    });
    const cond = object(step.cond);
    add('pH', cond.pH);
    for (const [key, label] of [['temp', 'Nhiệt độ'], ['time', 'Thời gian'], ['hum', 'Độ ẩm'], ['pres', 'Áp suất']]) add(label, quantity(cond[key]));
    const res = object(step.res);
    add('Khối lượng ban đầu', quantity(res.m0));
    add('Khối lượng sau phản ứng', quantity(res.m1));
    add('Hiệu suất', res.yield);
    add('Hình ảnh', list(step.images).map(file => value(file.name)).filter(Boolean).join(', '));
    add('Ghi chú', step.note);
  });
  return result;
}
function samples(data: unknown): Map<string, RecordValue> {
  const result = new Map<string, RecordValue>();
  const visit = (projects: unknown) => list(projects).forEach(project => {
    list(project.samples).forEach(sample => { if (typeof sample.id === 'string') result.set(sample.id, sample); });
    visit(project.children);
  });
  visit(object(data).projects);
  return result;
}

export function diffSamples(before: unknown, after: unknown): SampleChange[] {
  const oldSamples = samples(before), newSamples = samples(after);
  const changes: SampleChange[] = [];
  for (const id of new Set([...oldSamples.keys(), ...newSamples.keys()])) {
    const oldSample = oldSamples.get(id), newSample = newSamples.get(id);
    const oldFields = oldSample ? fields(oldSample) : new Map<string, string>();
    const newFields = newSample ? fields(newSample) : new Map<string, string>();
    const changed = [...new Set([...oldFields.keys(), ...newFields.keys()])]
      .filter(field => (oldFields.get(field) || '') !== (newFields.get(field) || ''))
      .map(field => ({ field, before: oldFields.get(field) || '', after: newFields.get(field) || '' }));
    if (changed.length || !oldSample || !newSample) changes.push({
      sampleId: id, sampleCode: value((newSample || oldSample)?.code),
      type: !oldSample ? 'created' : !newSample ? 'deleted' : 'edited', changes: changed
    });
  }
  return changes;
}
