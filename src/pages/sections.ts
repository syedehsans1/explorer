export const sections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    items: [
      {
        label: 'Introduction to the Pocket Network',
        slug: 'introduction',
        children: [
          { label: 'Actors on the Pocket Network', slug: 'actors-on-the-pocket-network' },
          { label: 'User Agency in Pocket', slug: 'user-agency-in-pocket' }
        ]
      }
    ]
  },
  {
    id: 'pocket-basics',
    title: 'Pocket Network Basics',
    icon: '<path stroke="currentColor" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" fill="none"/>',
    items: [
      {
        label: 'The Shannon upgrade and Pocket\'s new era',
        slug: 'shannon-upgrade',
        children: [
          { label: 'Technical Overview', slug: 'technical-overview' },
          { label: 'Launch Roadmap', slug: 'launch-roadmap' },
          { label: 'Shannon Actors Deep Dive', slug: 'shannon-actors-deep-dive' },
          { label: 'The Economics', slug: 'the-economics' }
        ]
      }
    ]
  },
  {
    id: 'contributing',
    title: 'Contributing to Pocket',
    icon: '<path stroke="currentColor" stroke-width="1.5" d="M12 3v18M3 12h18" fill="none"/>',
    items: [
      {
        label: 'How to Contribute to the Pocket Network',
        slug: 'contribute',
        children: [
          { label: 'Join the Conversation', slug: 'join-the-conversation' },
          { label: 'Contributing to Docs', slug: 'contributing-to-docs' }
        ]
      }
    ]
  },
  {
    id: 'growing',
    title: 'Growing with $POKT',
    icon: '<path stroke="currentColor" stroke-width="1.5" d="M12 2l3 7h7l-5.5 4 2 7L12 17l-6.5 3 2-7L2 9h7z" fill="none"/>',
    items: [
      {
        label: '$POKT: The Heart of the Pocket Network',
        slug: 'heart',
        children: [
          { label: 'Getting $POKT', slug: 'getting-pokt' },
          { label: 'Buying $POKT vs. Holding $POKT', slug: 'buying-vs-holding' },
          { label: 'Self-Custodying $POKT', slug: 'self-custodying' },
          { label: 'Liquidity Mining', slug: 'liquidity-mining' }
        ]
      }
    ]
  },
  {
    id: 'businesses',
    title: 'Businesses on Pocket',
    icon: '<rect x="3" y="7" width="18" height="10" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    items: [
      {
        label: 'Upcoming in the Businesses Section',
        slug: 'businesses',
        children: []
      }
    ]
  },
  {
    id: 'building',
    title: 'Building on the Pocket Network',
    icon: '<path stroke="currentColor" stroke-width="1.5" d="M4 6h16M4 12h8" fill="none"/>',
    items: [
      {
        label: 'Welcome to Pokt Roll',
        slug: 'pokt-roll',
        children: [
          { label: 'INFRA OPERATORS', slug: 'infra-operators', icon: '👤' },
          { label: 'PROTOCOL SPECIFICATIONS', slug: 'protocol-specifications', icon: '📋' },
          { label: 'USERS & EXPLORERS', slug: 'users-explorers', icon: '👥' },
          { label: 'CORE DEVELOPERS', slug: 'core-developers', icon: '💻' }
        ]
      },
      { label: 'How to Setup a Signal Proxy on Bare Metal', slug: 'setup-signal-proxy' },
      { label: 'How to Setup a Tor Bridge on Bare Metal', slug: 'setup-tor-bridge' }
    ]
  },
  {
    id: 'path-docs',
    title: 'Path Docs',
    icon: '<path stroke="currentColor" stroke-width="1.5" d="M3 12h18" fill="none"/>',
    items: [
      { label: 'Welcome to PATH', slug: 'welcome-to-path' },
      { label: 'path-backup-main - WIP', slug: 'path-backup-main' },
      { label: '4_http_status_code', slug: '4_http_status_code' },
      { label: '3_adding_new_archival', slug: '3_adding_new_archival' },
      { label: '6_grove', slug: '6_grove' }
    ]
  }
]
