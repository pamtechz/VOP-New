import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/services/storage.ts';
let source = readFileSync(path, 'utf8');
const oldImport = "import { calculateCurriculumProgress } from './progress';";
const newImport = "import { calculateCurriculumProgress, calculateCurriculumAverageScore } from './progress';";
const previous = `  const requestExists = getStoredGraduationRequests().some(request =>
    request.candidateId === user.uid && request.status !== 'rejected'
  );
  if (state.certificateEligible && !updated.information.graduated && !updated.information.graduating && !requestExists) {
    const firstRequired = guides.find(g => g.certificateEligible && g.language === language);
    if (firstRequired) {
      updated.information = { ...updated.information, graduating: true };
      submitGraduationRequest(updated, firstRequired, scorePercentage);
    }
  }`;
const replacement = `  const firstRequired = guides.find(g => g.certificateEligible && g.language === language);
  const requestExists = getStoredGraduationRequests().some(request =>
    request.candidateId === user.uid && request.guideId === firstRequired?.id && request.status !== 'rejected'
  );
  const averageScore = calculateCurriculumAverageScore(guides, updated, language);
  if (state.certificateEligible && averageScore !== null && firstRequired &&
      !updated.information.graduated && !updated.information.graduating && !requestExists) {
    updated.information = { ...updated.information, graduating: true };
    submitGraduationRequest(updated, firstRequired, averageScore);
  }`;

if (source.includes(newImport) && source.includes(replacement)) {
  console.log('VOP graduation average migration already applied.');
} else {
  if (!source.includes(oldImport) || !source.includes(previous) ||
      source.indexOf(oldImport) !== source.lastIndexOf(oldImport) ||
      source.indexOf(previous) !== source.lastIndexOf(previous)) {
    throw new Error('Unexpected VOP storage source: graduation average migration was not applied.');
  }
  source = source.replace(oldImport, newImport).replace(previous, replacement);
  writeFileSync(path, source);
  console.log('VOP graduation requests now record the average of required assessment marks.');
}
