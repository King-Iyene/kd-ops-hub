import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CONNECTION_PRESETS } from '../connectionPresets';
import { BRAND_ICONS } from '../brandIcons';
import { ToolIcon } from '../tabs/ToolIcon';

describe('tool logos', () => {
  const brandIds = ['slack', 'cliq', 'teams', 'discord', 'gchat', 'telegram', 'zapier', 'make', 'n8n', 'airtable', 'trello', 'clickup', 'notion', 'twilio'];
  it('every named tool has its logo with a real path and colour', () => {
    for (const id of brandIds) {
      expect(BRAND_ICONS[id], id).toBeTruthy();
      expect(BRAND_ICONS[id].path.length).toBeGreaterThan(40);
      expect(BRAND_ICONS[id].hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(CONNECTION_PRESETS.some((p) => p.id === id), `${id} is a preset`).toBe(true);
    }
  });
  it('draws the brand mark for a known tool and a plain icon for the rest', () => {
    const slack = CONNECTION_PRESETS.find((p) => p.id === 'slack')!;
    const email = CONNECTION_PRESETS.find((p) => p.id === 'email')!;
    const { container, rerender } = render(<ToolIcon preset={slack} />);
    expect(screen.getByTestId('logo-slack')).toBeTruthy();
    expect(container.querySelector('svg path')?.getAttribute('d')).toBe(BRAND_ICONS.slack.path);
    rerender(<ToolIcon preset={email} />);
    expect(screen.queryByTestId('logo-email')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
