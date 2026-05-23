import { useState } from 'react';
import { useWatchlistStore } from '../store/watchlistStore';

export default function WatchlistManager() {
  const { watchlists, saveWatchlists } = useWatchlistStore();

  const [name, setName] = useState('');

  function createWatchlist() {
    if (!name.trim()) return;

    const next = [
      ...watchlists,
      {
        id: Date.now(),
        name,
        symbols: [],
      },
    ];

    saveWatchlists(next);
    setName('');
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New watchlist"
          style={{
            flex: 1,
            background: '#050505',
            color: 'white',
            border: '1px solid #202020',
            borderRadius: 10,
            padding: 10,
          }}
        />

        <button onClick={createWatchlist}>
          Save
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {watchlists.map((watchlist) => (
          <div
            key={watchlist.id}
            style={{
              border: '1px solid #202020',
              borderRadius: 10,
              padding: 12,
            }}
          >
            <strong>{watchlist.name}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
