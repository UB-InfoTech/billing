const formulaReferences = formula =>
  [...new Set(String(formula || "").match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])];

function findRemovedFieldDependency(fields, removedKeys) {
  const removed = removedKeys instanceof Set ? removedKeys : new Set(removedKeys || []);
  if (!removed.size) return null;

  for (const field of fields || []) {
    for (const key of formulaReferences(field.formula)) {
      if (removed.has(key)) {
        return { field, removedKey: key, kind: "calculation" };
      }
    }

    for (const condition of field.conditions || []) {
      if (removed.has(condition.fieldKey)) {
        return { field, removedKey: condition.fieldKey, kind: "rule" };
      }
    }

    for (const mapping of field.dataSource?.autoFill || []) {
      if (removed.has(mapping.targetKey)) {
        return { field, removedKey: mapping.targetKey, kind: "auto-fill" };
      }
    }
  }

  return null;
}

function validateFormulaGraph(fields) {
  const byKey = new Map((fields || []).map(field => [field.key, field]));
  const graph = new Map();

  for (const field of fields || []) {
    if (!field.formula) continue;
    const refs = formulaReferences(field.formula);

    for (const ref of refs) {
      if (!byKey.has(ref)) {
        throw new Error(
          'The calculation for "' + field.label +
          '" refers to a field that is no longer available.'
        );
      }
    }

    graph.set(field.key, refs.filter(ref => byKey.get(ref)?.formula));
  }

  const visiting = new Set();
  const visited = new Set();

  const walk = key => {
    if (visiting.has(key)) {
      const field = byKey.get(key);
      throw new Error(
        'The calculation for "' + (field?.label || "this field") +
        '" creates a circular calculation. Choose a different field.'
      );
    }
    if (visited.has(key)) return;

    visiting.add(key);
    (graph.get(key) || []).forEach(walk);
    visiting.delete(key);
    visited.add(key);
  };

  graph.forEach((_, key) => walk(key));
}

function validateFieldReferences(fields) {
  const keys = new Set((fields || []).map(field => field.key));

  for (const field of fields || []) {
    const danglingCondition = (field.conditions || []).find(
      condition => !keys.has(condition.fieldKey)
    );
    if (danglingCondition) {
      throw new Error(
        'A rule for "' + field.label +
        '" refers to a field that is no longer available.'
      );
    }

    const danglingMapping = (field.dataSource?.autoFill || []).find(
      mapping => !keys.has(mapping.targetKey)
    );
    if (danglingMapping) {
      throw new Error(
        'An auto-fill mapping for "' + field.label +
        '" refers to a field that is no longer available.'
      );
    }
  }

  validateFormulaGraph(fields);
}

module.exports = {
  formulaReferences,
  findRemovedFieldDependency,
  validateFormulaGraph,
  validateFieldReferences
};
