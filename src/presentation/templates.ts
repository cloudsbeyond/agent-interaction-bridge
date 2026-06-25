import type {
  PresentationBlock,
  PresentationDocument,
  PresentationLayout,
  PresentationMetric,
} from './document';
import { bodyToLines, compactLine, firstLine } from './document';
import {
  ARCHITECTURE_SECTION_TITLES,
  COMPARISON_SECTION_TITLES,
  REPORT_SECTION_TITLES,
} from './section-profiles';

export interface SectionLike {
  title: string;
  body: string;
}

export interface AnswerPresentationLike {
  title: string;
  layout?: PresentationLayout;
  sections: SectionLike[];
}

export function answerPresentationToDocument(input: AnswerPresentationLike): PresentationDocument {
  const layout = input.layout ?? 'generic';
  switch (layout) {
    case 'architecture':
      return architectureDocument(input.title, input.sections);
    case 'report':
      return reportDocument(input.title, input.sections);
    case 'comparison':
      return comparisonDocument(input.title, input.sections);
    case 'visual':
      return visualDocument(input.title, input.sections);
    case 'generic':
    default:
      return genericDocument(input.title, input.sections);
  }
}

function genericDocument(title: string, sections: SectionLike[]): PresentationDocument {
  return {
    title,
    layout: 'generic',
    blocks: sections.map(sectionBlock),
  };
}

function architectureDocument(title: string, sections: SectionLike[]): PresentationDocument {
  const [leadTitle, flowTitle, componentTitle, endpointTitle, boundaryTitle] = ARCHITECTURE_SECTION_TITLES;
  const lead = findSection(sections, leadTitle);
  const flowSteps = [
    findSection(sections, flowTitle),
    findSection(sections, componentTitle),
    findSection(sections, endpointTitle),
  ]
    .filter((section): section is SectionLike => Boolean(section))
    .map((section) => ({ title: section.title, lines: bodyToLines(section.body) }));
  const boundary = findSection(sections, boundaryTitle);
  const rest = sections.filter(
    (section) => !ARCHITECTURE_SECTION_TITLES.includes(section.title as typeof ARCHITECTURE_SECTION_TITLES[number]),
  );
  const blocks: PresentationBlock[] = [
    ...(lead ? [{ kind: 'lead' as const, title: lead.title, text: firstLine(lead.body) }] : []),
    ...(flowSteps.length > 0 ? [{ kind: 'flow' as const, steps: flowSteps }] : []),
    ...(boundary ? [{ kind: 'divider' as const }, sectionBlock(boundary)] : []),
    ...rest.map(sectionBlock),
  ];
  return { title, layout: 'architecture', blocks };
}

function reportDocument(title: string, sections: SectionLike[]): PresentationDocument {
  const [statusTitle, doneTitle, inProgressTitle, riskTitle, nextTitle] = REPORT_SECTION_TITLES;
  const status = findSection(sections, statusTitle);
  const done = findSection(sections, doneTitle);
  const risk = findSection(sections, riskTitle);
  const metrics: PresentationMetric[] = [
    ...(status ? [{ label: statusTitle, value: compactLine(status.body, 48) }] : []),
    ...(done ? [{ label: doneTitle, value: doneMetric(done.body) }] : []),
    ...(risk ? [{ label: riskTitle, value: compactLine(risk.body, 48) }] : []),
  ];
  const ordered = uniqueReportSections([
    done,
    findSection(sections, inProgressTitle),
    findSection(sections, nextTitle),
    risk,
    ...sections.filter(
      (section) => !REPORT_SECTION_TITLES.includes(section.title as typeof REPORT_SECTION_TITLES[number]),
    ),
  ].filter((section): section is SectionLike => Boolean(section)));
  return {
    title,
    layout: 'report',
    blocks: [
      ...(metrics.length > 0 ? [{ kind: 'metric_grid' as const, metrics }] : []),
      ...ordered.map(sectionBlock),
    ],
  };
}

function comparisonDocument(title: string, sections: SectionLike[]): PresentationDocument {
  const [conclusionTitle, leftTitle, rightTitle] = COMPARISON_SECTION_TITLES;
  const conclusion = findSection(sections, conclusionTitle);
  const left = findSection(sections, leftTitle);
  const right = findSection(sections, rightTitle);
  const rest = sections.filter(
    (section) => !COMPARISON_SECTION_TITLES.includes(section.title as typeof COMPARISON_SECTION_TITLES[number]),
  );
  return {
    title,
    layout: 'comparison',
    blocks: [
      ...(conclusion ? [{ kind: 'lead' as const, title: conclusion.title, text: firstLine(conclusion.body) }] : []),
      ...(left || right
        ? [{
            kind: 'columns' as const,
            columns: [left, right]
              .filter((section): section is SectionLike => Boolean(section))
              .map((section) => ({ title: section.title, lines: bodyToLines(section.body) })),
          }]
        : []),
      ...rest.map(sectionBlock),
    ],
  };
}

function visualDocument(title: string, sections: SectionLike[]): PresentationDocument {
  return {
    title,
    layout: 'visual',
    blocks: sections.map(sectionBlock),
  };
}

function sectionBlock(section: SectionLike): PresentationBlock {
  return {
    kind: 'section',
    title: section.title,
    lines: bodyToLines(section.body),
  };
}

function findSection(sections: SectionLike[], title: string): SectionLike | undefined {
  return sections.find((section) => section.title === title);
}

function doneMetric(body: string): string {
  const count = bodyToLines(body).length;
  return count > 1 ? `${count} 项` : firstLine(body);
}

function uniqueReportSections(sections: SectionLike[]): SectionLike[] {
  const seen = new Set<string>();
  return sections.filter((section) => {
    const key = bodyToLines(section.body).join('\n');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
