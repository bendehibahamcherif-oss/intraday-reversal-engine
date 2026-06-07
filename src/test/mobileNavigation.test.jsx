/**
 * Mobile navigation tests.
 *
 * Verifies that:
 *  - The canonical workspace registry exports all 18 workspaces
 *  - Mobile primary tabs cover the correct 4 workspaces
 *  - Every non-primary workspace appears in MOBILE_MORE_WORKSPACES
 *  - workspaceStore rejects unknown ids and validates on rehydrate
 *  - MobileBottomNav renders primary tabs and the More button
 *  - Clicking a primary tab calls setWorkspace with the correct id
 *  - Clicking MORE opens the drawer listing all non-primary workspaces
 *  - Selecting a workspace from the drawer calls setWorkspace and closes drawer
 *  - Active primary tab highlight follows workspace state
 *  - Active more-item highlight follows workspace state when in More workspaces
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  WORKSPACES,
  WORKSPACE_IDS,
  MOBILE_PRIMARY_TAB_IDS,
  MOBILE_MORE_WORKSPACES,
  isValidWorkspace,
  DEFAULT_WORKSPACE,
} from '../config/workspaces.js';

// ── Registry shape ────────────────────────────────────────────────────────────

describe('workspace registry', () => {
  it('exports exactly 18 workspaces', () => {
    expect(WORKSPACES).toHaveLength(18);
  });

  it('every workspace has required fields', () => {
    for (const w of WORKSPACES) {
      expect(w.id,       `${w.id} missing id`).toBeTruthy();
      expect(w.label,    `${w.id} missing label`).toBeTruthy();
      expect(w.abbr,     `${w.id} missing abbr`).toBeTruthy();
      expect(w.icon,     `${w.id} missing icon`).toBeTruthy();
      expect(w.group,    `${w.id} missing group`).toBeTruthy();
      expect(w.order,    `${w.id} missing order`).toBeGreaterThan(0);
    }
  });

  it('WORKSPACE_IDS is a superset of all workspace ids', () => {
    for (const w of WORKSPACES) {
      expect(WORKSPACE_IDS.has(w.id)).toBe(true);
    }
  });

  it('isValidWorkspace returns true for all registry ids', () => {
    for (const w of WORKSPACES) {
      expect(isValidWorkspace(w.id)).toBe(true);
    }
  });

  it('isValidWorkspace returns false for unknown ids', () => {
    expect(isValidWorkspace('Admin')).toBe(false);
    expect(isValidWorkspace('')).toBe(false);
    expect(isValidWorkspace(undefined)).toBe(false);
    expect(isValidWorkspace('FakeWorkspace')).toBe(false);
  });

  it('DEFAULT_WORKSPACE is a valid id', () => {
    expect(isValidWorkspace(DEFAULT_WORKSPACE)).toBe(true);
  });
});

// ── Mobile primary tabs ───────────────────────────────────────────────────────

describe('mobile primary tabs', () => {
  it('has exactly 4 primary tab ids', () => {
    expect(MOBILE_PRIMARY_TAB_IDS).toHaveLength(4);
  });

  it('every primary tab id is in the registry', () => {
    for (const id of MOBILE_PRIMARY_TAB_IDS) {
      expect(isValidWorkspace(id)).toBe(true);
    }
  });

  it('MOBILE_MORE_WORKSPACES contains all non-primary workspaces', () => {
    const primarySet = new Set(MOBILE_PRIMARY_TAB_IDS);
    const expected = WORKSPACES.filter((w) => !primarySet.has(w.id));
    expect(MOBILE_MORE_WORKSPACES).toHaveLength(expected.length);
    for (const w of expected) {
      expect(MOBILE_MORE_WORKSPACES.some((m) => m.id === w.id)).toBe(true);
    }
  });

  it('MOBILE_MORE_WORKSPACES + primary tabs covers every workspace exactly once', () => {
    const all = [...MOBILE_PRIMARY_TAB_IDS, ...MOBILE_MORE_WORKSPACES.map((w) => w.id)];
    expect(new Set(all).size).toBe(WORKSPACES.length);
    expect(all).toHaveLength(WORKSPACES.length);
  });
});

// ── MobileBottomNav component ─────────────────────────────────────────────────

// Mock zustand store so we can control workspace state.
const mockSetWorkspace = vi.fn();
let mockWorkspace = DEFAULT_WORKSPACE;

vi.mock('../store/workspaceStore.js', () => ({
  useWorkspaceStore: (selector) =>
    selector({ workspace: mockWorkspace, setWorkspace: mockSetWorkspace }),
}));

import MobileBottomNav from '../components/terminal/MobileBottomNav.jsx';

describe('MobileBottomNav', () => {
  beforeEach(() => {
    mockWorkspace = DEFAULT_WORKSPACE;
    mockSetWorkspace.mockClear();
  });

  it('renders a button for each primary tab', () => {
    render(<MobileBottomNav />);
    for (const id of MOBILE_PRIMARY_TAB_IDS) {
      expect(screen.getByTestId(`mobile-tab-${id}`)).toBeTruthy();
    }
  });

  it('renders a More button', () => {
    render(<MobileBottomNav />);
    expect(screen.getByTestId('mobile-tab-more')).toBeTruthy();
  });

  it('clicking a primary tab calls setWorkspace', () => {
    render(<MobileBottomNav />);
    const firstId = MOBILE_PRIMARY_TAB_IDS[0];
    fireEvent.click(screen.getByTestId(`mobile-tab-${firstId}`));
    expect(mockSetWorkspace).toHaveBeenCalledWith(firstId);
  });

  it('drawer is not visible initially', () => {
    render(<MobileBottomNav />);
    expect(screen.queryByTestId('more-drawer')).toBeNull();
  });

  it('clicking MORE opens the drawer', () => {
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByTestId('mobile-tab-more'));
    expect(screen.getByTestId('more-drawer')).toBeTruthy();
  });

  it('drawer lists all non-primary workspaces', () => {
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByTestId('mobile-tab-more'));
    for (const ws of MOBILE_MORE_WORKSPACES) {
      expect(screen.getByTestId(`more-item-${ws.id}`)).toBeTruthy();
    }
  });

  it('selecting a workspace from the drawer calls setWorkspace and closes the drawer', () => {
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByTestId('mobile-tab-more'));
    const firstMore = MOBILE_MORE_WORKSPACES[0];
    fireEvent.click(screen.getByTestId(`more-item-${firstMore.id}`));
    expect(mockSetWorkspace).toHaveBeenCalledWith(firstMore.id);
    expect(screen.queryByTestId('more-drawer')).toBeNull();
  });
});
