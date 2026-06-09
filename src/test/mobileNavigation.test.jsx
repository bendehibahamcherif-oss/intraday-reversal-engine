/**
 * Mobile navigation tests.
 *
 * Verifies that:
 *  - The canonical workspace registry exports all required workspaces
 *  - Mobile primary tabs cover the correct workspaces
 *  - Every non-primary workspace appears in getMobileMoreWorkspaces()
 *  - workspaceStore rejects unknown ids via normalizeWorkspaceId
 *  - MobileBottomNav renders primary tabs and the More button
 *  - Clicking a primary tab calls setWorkspace with the correct id
 *  - Clicking MORE opens the dialog listing all non-primary workspaces
 *  - Selecting a workspace from the dialog calls setWorkspace and closes it
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  sortedWorkspaces,
  workspaceIds,
  getMobilePrimaryWorkspaces,
  getMobileMoreWorkspaces,
  getDesktopWorkspaces,
  isValidWorkspaceId,
  normalizeWorkspaceId,
  DEFAULT_WORKSPACE_ID,
  getWorkspace,
} from '../config/workspaces.js';

// ── Registry shape ────────────────────────────────────────────────────────────

describe('workspace registry', () => {
  it('exports at least 18 canonical workspaces', () => {
    expect(sortedWorkspaces.length).toBeGreaterThanOrEqual(18);
  });

  it('every workspace has required fields', () => {
    for (const w of sortedWorkspaces) {
      expect(w.id,     `${w.id} missing id`).toBeTruthy();
      expect(w.label,  `${w.id} missing label`).toBeTruthy();
      expect(w.icon,   `${w.id} missing icon`).toBeTruthy();
      expect(w.group,  `${w.id} missing group`).toBeTruthy();
      expect(w.order,  `${w.id} missing order`).toBeGreaterThan(0);
    }
  });

  it('workspaceIds is a superset of all workspace ids', () => {
    for (const w of sortedWorkspaces) {
      expect(workspaceIds.has(w.id)).toBe(true);
    }
  });

  it('isValidWorkspaceId returns true for all registry ids', () => {
    for (const w of sortedWorkspaces) {
      expect(isValidWorkspaceId(w.id)).toBe(true);
    }
  });

  it('isValidWorkspaceId returns false for unknown ids', () => {
    expect(isValidWorkspaceId('Admin')).toBe(false);
    expect(isValidWorkspaceId('')).toBe(false);
    expect(isValidWorkspaceId(undefined)).toBe(false);
    expect(isValidWorkspaceId('FakeWorkspace')).toBe(false);
  });

  it('DEFAULT_WORKSPACE_ID is a valid id', () => {
    expect(isValidWorkspaceId(DEFAULT_WORKSPACE_ID)).toBe(true);
  });

  it('normalizeWorkspaceId falls back to DEFAULT_WORKSPACE_ID for unknown ids', () => {
    expect(normalizeWorkspaceId('UnknownXYZ')).toBe(DEFAULT_WORKSPACE_ID);
    expect(normalizeWorkspaceId('')).toBe(DEFAULT_WORKSPACE_ID);
    expect(normalizeWorkspaceId(undefined)).toBe(DEFAULT_WORKSPACE_ID);
  });

  it('normalizeWorkspaceId returns the id unchanged for valid ids', () => {
    for (const w of sortedWorkspaces) {
      expect(normalizeWorkspaceId(w.id)).toBe(w.id);
    }
  });

  it('getWorkspace returns the correct workspace for a valid id', () => {
    for (const w of sortedWorkspaces) {
      expect(getWorkspace(w.id).id).toBe(w.id);
    }
  });

  it('getWorkspace falls back to default for unknown ids', () => {
    expect(getWorkspace('Unknown').id).toBe(DEFAULT_WORKSPACE_ID);
  });
});

// ── Mobile primary tabs ───────────────────────────────────────────────────────

describe('mobile primary tabs', () => {
  it('has at least 4 primary tab workspaces', () => {
    expect(getMobilePrimaryWorkspaces().length).toBeGreaterThanOrEqual(4);
  });

  it('every primary tab id is in the registry', () => {
    for (const w of getMobilePrimaryWorkspaces()) {
      expect(isValidWorkspaceId(w.id)).toBe(true);
    }
  });

  it('getMobileMoreWorkspaces contains all non-primary mobile workspaces', () => {
    const primaryIds = new Set(getMobilePrimaryWorkspaces().map((w) => w.id));
    const moreItems  = getMobileMoreWorkspaces();
    const allMobile  = sortedWorkspaces.filter((w) => w.mobileVisible);
    const expected   = allMobile.filter((w) => !primaryIds.has(w.id));
    expect(moreItems).toHaveLength(expected.length);
    for (const w of expected) {
      expect(moreItems.some((m) => m.id === w.id)).toBe(true);
    }
  });

  it('primary tabs + more items cover every mobile workspace exactly once', () => {
    const all = [
      ...getMobilePrimaryWorkspaces().map((w) => w.id),
      ...getMobileMoreWorkspaces().map((w) => w.id),
    ];
    const mobileWorkspaces = sortedWorkspaces.filter((w) => w.mobileVisible);
    expect(new Set(all).size).toBe(mobileWorkspaces.length);
    expect(all).toHaveLength(mobileWorkspaces.length);
  });
});

// ── Desktop nav ───────────────────────────────────────────────────────────────

describe('desktop nav', () => {
  it('getDesktopWorkspaces returns only desktopVisible workspaces', () => {
    const desktop = getDesktopWorkspaces();
    for (const w of desktop) {
      expect(w.desktopVisible).toBe(true);
    }
  });

  it('includes critical workspaces on desktop', () => {
    const desktopIds = new Set(getDesktopWorkspaces().map((w) => w.id));
    for (const id of ['Risk', 'MLEngine', 'AILab', 'HistoricalData', 'Portfolio', 'Alerts']) {
      expect(desktopIds.has(id), id + ' missing from desktop nav').toBe(true);
    }
  });
});

// ── MobileBottomNav component ─────────────────────────────────────────────────

const mockSetWorkspace = vi.fn();
let mockWorkspace = DEFAULT_WORKSPACE_ID;

vi.mock('../store/workspaceStore.js', () => ({
  useWorkspaceStore: (selector) =>
    selector({ workspace: mockWorkspace, setWorkspace: mockSetWorkspace }),
}));

import MobileBottomNav from '../components/terminal/MobileBottomNav.jsx';

describe('MobileBottomNav', () => {
  beforeEach(() => {
    mockWorkspace = DEFAULT_WORKSPACE_ID;
    mockSetWorkspace.mockClear();
  });

  it('renders a button for each primary tab and the More button', () => {
    render(<MobileBottomNav />);
    for (const tab of getMobilePrimaryWorkspaces()) {
      expect(screen.getByTestId(tab.navTestId)).toBeTruthy();
    }
    expect(screen.getByTestId('mobile-more-workspaces')).toBeTruthy();
  });

  it('clicking a primary tab calls setWorkspace', () => {
    render(<MobileBottomNav />);
    const first = getMobilePrimaryWorkspaces()[0];
    fireEvent.click(screen.getByTestId(first.navTestId));
    expect(mockSetWorkspace).toHaveBeenCalledWith(first.id);
  });

  it('dialog is not visible initially', () => {
    render(<MobileBottomNav />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clicking More opens the dialog', () => {
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByTestId('mobile-more-workspaces'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('dialog lists all non-primary mobile workspaces', () => {
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByTestId('mobile-more-workspaces'));
    for (const ws of getMobileMoreWorkspaces()) {
      expect(screen.getByTestId(ws.navTestId)).toBeTruthy();
    }
  });

  it('selecting a workspace from the dialog calls setWorkspace and closes the dialog', () => {
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByTestId('mobile-more-workspaces'));
    const firstMore = getMobileMoreWorkspaces().find((w) => w.implemented);
    fireEvent.click(screen.getByTestId(firstMore.navTestId));
    expect(mockSetWorkspace).toHaveBeenCalledWith(firstMore.id);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
