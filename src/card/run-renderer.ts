import { presentRunState, type RunPresentationSection } from '../signal/run-presentation';
import { formatFeishuCardMarkdown } from './feishu-markdown';
import type { RunState } from './run-state';

export function renderCard(state: RunState): object {
  const presentation = presentRunState(state);
  const elements = presentation.sections.flatMap(renderSection);
  if (presentation.controls.stop) elements.push(stopButton());

  return {
    schema: '2.0',
    config: {
      streaming_mode: presentation.streaming,
      summary: { content: presentation.summary },
    },
    body: { elements },
  };
}

function renderSection(section: RunPresentationSection): object[] {
  switch (section.kind) {
    case 'markdown':
      return [markdown(section.body)];
    case 'note':
      return [noteMd(section.body)];
    case 'panel':
      return [
        collapsiblePanel({
          title: section.title,
          expanded: section.expanded,
          border: section.tone === 'danger' ? 'red' : 'grey',
          body: section.body,
        }),
      ];
    case 'tool_summary':
      return [collapsedToolSummary(section)];
  }
}

/**
 * Render N tool calls as a single collapsed panel. **Body content is dropped**
 * — only the per-tool header line (icon + name + short summary) is kept.
 *
 * Why no bodies: with full input/output panels nested, the serialized JSON
 * can easily exceed Feishu's per-element size limit (~30KB), causing 400
 * errors that abort the entire card stream. Tool details are still in the
 * file log; users who really need them can `/doctor` to inspect.
 *
 * The latest-running tool, when applicable, is rendered separately via
 * a `panel` section so live observation isn't sacrificed.
 */
function collapsedToolSummary(section: Extract<RunPresentationSection, { kind: 'tool_summary' }>): object {
  const headerList = section.items.map((item) => `- ${item}`).join('\n');
  return {
    tag: 'collapsible_panel',
    expanded: section.expanded,
    header: panelHeader(section.title),
    border: { color: 'blue', corner_radius: '5px' },
    vertical_spacing: '8px',
    padding: '8px 8px 8px 8px',
    elements: [noteMd(headerList)],
  };
}

interface PanelOpts {
  title: string;
  expanded: boolean;
  border: 'grey' | 'red' | 'blue';
  body: string;
}

function collapsiblePanel(opts: PanelOpts): object {
  return {
    tag: 'collapsible_panel',
    expanded: opts.expanded,
    header: panelHeader(opts.title),
    border: { color: opts.border, corner_radius: '5px' },
    vertical_spacing: '8px',
    padding: '8px 8px 8px 8px',
    elements: [noteMd(opts.body)],
  };
}

function panelHeader(titleMd: string): object {
  return {
    title: { tag: 'markdown', content: formatFeishuCardMarkdown(titleMd) },
    vertical_align: 'center',
    icon: { tag: 'standard_icon', token: 'down-small-ccm_outlined', size: '16px 16px' },
    icon_position: 'follow_text',
    icon_expanded_angle: -180,
  };
}

function markdown(content: string): object {
  return { tag: 'markdown', content: formatFeishuCardMarkdown(content) };
}

function noteMd(content: string): object {
  return { tag: 'markdown', content: formatFeishuCardMarkdown(content), text_size: 'notation' };
}

function stopButton(): object {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: '⏹ 终止' },
    type: 'danger',
    behaviors: [{ type: 'callback', value: { cmd: 'stop' } }],
  };
}
