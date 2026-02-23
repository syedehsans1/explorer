export interface PageContent {
  breadcrumb: string
  title: string
  subtitle: string
  content: string
}

export const pageContents: Record<string, PageContent> = {
  introduction: {
    breadcrumb: 'Getting Started',
    title: 'Introduction to the Pocket Network',
    subtitle: 'Networks are fragile. Pocket is unstoppable.',
    content: `
    <h2>On Unstoppable Open Data & The Crypto-Native API Layer</h2>
      <p>APIs are the bridges that connect applications and their users to the <strong>data and services</strong> they need. Whether you're checking the weather in your phone's app or using sophisticated AI agents or swapping stablecoins, one or more APIs are quietly <strong>doing the work</strong> behind the scenes.</p>
      <br/>
      <p>In Web3, this layer is often missing a key piece to be truly unstoppable: a <strong>crypto-native</strong> way to access open data and services without relying on centralized intermediaries. Pocket Network coordinates the actors needed to fill that gap. Without a trustless API layer, your apps and <strong>services are still at risk of censorship</strong>, shifting political scenarios and other force majeure events that can lead to interruptions of service. Pocket allows for the data that fuels value creation on the blockchain to be as unstoppable as the consensus layers that they inform.</p>
      <br/>
      <p>Simply put, Pocket is a <strong>broad, permissionless registry of public APIs</strong>. The goal is to allow anyone; developers, enterprises, or autonomous agents, to access public data sources (from blockchains to geospatial datasets) and open-source services (like AI models or live data feeds) without gatekeepers.</p>
      <br/>
      <p>It works in two ways. First, it creates a <strong>permissionless registry</strong>, a decentralized directory, where anyone can list an API for a public service or dataset. Second, <strong>it incentivizes independent operators to run and maintain these APIs</strong>, rewarding them for reliability and performance, and penalizing bad actors.</p>
      <br/>
      <p>This ensures the network stays online and trustworthy <strong>without</strong> needing a single company in charge. As long as the network actors continue to perform their roles, all open data it supports will remain unstoppable.</p>
    `  
  },

  'actors-on-the-pocket-network': {
    breadcrumb: 'Getting Started > Introduction to the Pocket Network',
    title: 'Actors on the Pocket Network:',
    subtitle: 'Meet the forces behind unstoppable open data.',
    content: `
      <h1 class="text-[18px] font-bold">Pocket’s purpose is to power unstoppable open data and open infrastructure, governed by its users.</h1>
      <br/>
      <p class="text-[14px]">It allows developers to access data from 50+ chains with low cost and high resilience with just <strong>one connection</strong>. To achieve it, The Pocket Network needs to incentivize and coordinate a decentralized network of operators to run nodes that enable applications to <strong>read and write to blockchains</strong>.</p>
      <br/>
      <p class="text-[14px]">This is not just an aspirational reality - as of August 2025, Pocket approaches <strong>1 Trillion relays</strong> served from gateways to thousands of nodes to across 22 countries. In its current protocol architecture, Pocket Network can serve <strong>any open-data source</strong> to any and all supported blockchains, soon to be, any blockchain.</p>
      <br/>
      <p class="text-[14.5px]">Ok, so far we understood what Pocket does and how Pocket’s technology is ready to provide the world with <strong>unstoppable open data</strong>. Let’s look at the networked actors involved in making it a reality.</p>
      <br/>
      <h2 class="text-[17px] font-bold">Together, they empower developers with access to the most reliable, performant, and cost-effective data.</h2>
      <br/>
      <p class="text-[14px]">The potential use cases are wide-ranging. Developers can tap into blockchain data without running their own infrastructure. Researchers can query global geospatial datasets without going through commercial platforms. AI projects can connect to open-source language models (LLMs) directly, without routing through big tech APIs. And because the registry is <strong>permissionless</strong>, new services can be added by anyone, expanding the network’s capabilities over time.</p>
      <br/>
      
      <!-- Divider -->
      <div class="h-px bg-[#e6ebf2] dark:bg-white/10"></div>
      <br/>

      <p class="text-[14px]">The following articles will focus on getting you up and running fast - but a “Network Agent” is not the same as “Network Participant”.  You, a person, have your own goals, talents and desires and therefore a different set of expectations and needs than most other users - and that’s by design...</p>
      <br/>
    `
  },

  'user-agency-in-pocket': {
    breadcrumb: 'Getting Started > Introduction to the Pocket Network',
    title: 'User Agency in Pocket',
    subtitle: 'Four goals, one network. Navigation is easier if you know where you want to go.',
    content: `
      <h1 class="text-[18px] font-bold">Getting started depends on who you are and what you want. </h1>
      <br/>
      <p class="text-[14px]">This documentation is designed around <strong>four pillars</strong> of participation on the network. Each represents a series of <strong>actions</strong> you can take inside Pocket and might need instruction on. Together they cover everything the network enables.</p>
      <br/>
      <p class="text-[14px]">We’re actively working on building curated tracks for each of these goals, and will be releasing the new documentation on a rolling basis, asap. These tracks will give you <strong>tailored learning paths</strong> through the documentation. For now, the structure is still taking shape — but the goals are here, and they’ll grow into the foundations of your Pocket journey.</p>
      <br/>
      <p class="text-[14px]">Rather than reading the docs front to back, you’ll find it easier to succeed by focusing on the action that matters to you <strong>at each moment</strong>. Start by asking yourself: what do I want to do right now? — and let that guide your way through the content — Here's the pillars we are working on: </p>
      <br/>
      <h2 class="text-[18px] font-bold">Learn & Participate</h2>
      <br/>
      <p class="text-[14px]">For anyone holding or that wants to hold <strong>$POKT</strong> who wants to understand the basics: how to store, trade, or stake tokens, join the community, and take part in governance.</p>
      <br/>
      <h2 class="text-[18px] font-bold">Grow Capital</h2>
      <br/>
      <p class="text-[14px]">For those looking to make the most of the resources they commit to Pocket — covering staking rewards, incentive programs, and other opportunities to grow with <strong>$POKT</strong>.</p>
      <br/>
      <h2 class="text-[18px] font-bold">Build & Contribute</h2>
      <br/>
      <p class="text-[14px]">For technical users who want to engage with Pocket at the code and infrastructure level — from protocol contributions to SDK integrations and developer tools.</p>
      <br/>
      <h2 class="text-[18px] font-bold">Launch & Operate</h2>
      <br/>
      <p class="text-[14px]">For entrepreneurs and operators who want to create businesses on Pocket, run nodes or gateways, or add new revenue streams by building services around the network.</p>
      <br/>

      <!-- Divider -->
      <div class="h-px bg-[#e6ebf2] dark:bg-white/10"></div>
      <br/>

      <p class="text-[14px]"><strong>Think of these four goals as guideposts</strong>. You don’t need to master them all at once — just focus on the one that matters most to you <strong>now</strong>. The rest will be here when you’re ready to expand your role in Pocket. </p>
      <br/>
      <p class="text-[14px]">And don't forget to reach out to the community in times of need, that's what we are all here for. All the links you'll ever need are in the footer.  On the next articles, we will get you initiated on Pocket's beating heart... </p>

    `
  },

  'shannon-upgrade': {
    breadcrumb: 'Pocket Network Basics',
    title: 'The Shannon upgrade and Pocket\'s new era',
    subtitle: 'Laying the groundwork for open data at scale.',
    content: `
      <h2 class="text-[18px] font-bold">The Shannon Upgrade</h2>
      <br/>
      <p class="text-[14px]">The Shannon upgrade transformed The Pocket Network into the first true sharing economy for any open data-source. It is governed by an <strong>empowered community</strong> that has both full supply and demand side decentralization. Here are the key components of how the Pocket Network achieves this:</p>
      <br/>
      <h2 class="text-[18px] font-bold">Permissionless Gateways</h2>
      <br/>
      <p>Gateways handle the interaction between client applications and data suppliers, by facilitating the connection of a client’s data request (<strong>relay</strong>) with appropriate suppliers. Gateways handle the onchain transactions and service payments, from the client’s stake to the suppliers. Gateways can also <strong>design and manage</strong> other offchain operations and services that improve or inform the user experience of the Pocket Network, like dashboards and providing quality of service guarantees (Service Level Agreements, SLA).</p>
      <br/>
      <p class="text-[14px]">The creation of Gateways is fully <strong>permissionless</strong>. This enables rapid volume growth needed to operate the fully open and universal API infra layer that is the Pocket Network.</p>
      <br/>
      <h2 class="text-[18px] font-bold">Improved Scalability</h2>
      <br/>
      <p class="text-[14px]">The recent Shannon upgrade removed the remaining limitations on the protocol’s scalability and brought interoperability with key ecosystems in Web3, opening the Pocket Network fully to serve the rest of the world with <strong>sovereign data</strong>. At the moment serving over 50 blockchains, with upgrades planned to be fully <strong>blockchain agnostic</strong> through Inter-Blockchain Communication (IBC) and modular Data Availability (DA) layers.</p>
      <br/>
      <h2 class="text-[18px] font-bold">New Use Cases</h2>
      <br/>
      <p class="text-[14px]">Shannon took the Data Source expansion that we started in Morse and introduced tokenomics that enable monetization for the Data Sources themselves. This <strong>accelerates</strong> our expansion into new use cases and provides a new sustainable incentive model for open Data Sources of all kinds.</p>
      <br/>
      <p class="text-[14px]">We are at the cusp of an explosion in innovative business cases around <strong>data provision, organisation and collection</strong>. The Pocket Network guarantees that all parts of the value chain get their cut and remain sovereign while <strong>un-siloing</strong> data from geographic, political or other rent-seeking strongholds.</p>
      <br/>
      <p class="text-[14px]">Here’s a few ideas of what could be built on the Pocket Network:</p>
      <br/>
      <p class="text-[14px]"><strong>• Enterprise-grade RPC</strong> (Remote Procedure Call) services with guaranteed SLA (Service Level Agreements) uptime</p>
      <br/>
      <p class="text-[14px]"><strong>• Open datasets</strong> (climate, research, IoT — Internet of Things) that earn directly</p>
      <br/>
      <p class="text-[14px]"><strong>• Developer gateways</strong> with dashboards and analytics</p>
      <br/>
      <p class="text-[14px]"><strong>• Cross-ecosystem bridges</strong> via IBC (Inter-Blockchain Communication) and DA (Data Availability) layers</p>
      <br/>
      <p class="text-[14px]"><strong>• Localized gateways</strong> serving niche communities</p>
      <br/>
      <p class="text-[14px]"><strong>• Next-gen dApps</strong> (Decentralized Applications) combining blockchain and real-world data”</p>
    `  
  },

  'technical-overview': {
    breadcrumb: 'POCKET NETWORK BASICS > THE SHANNON UPGRADE AND POCKET\'S NEW ERA',
    title: 'Technical Overview',
    subtitle: 'The building blocks that make Pocket modular, secure, and future-proof.',
    content: `
      <h1 class="text-[18px] font-bold">Mainline Cosmos SDK</h1>
      <br/>
      <p class="text-[14px]">The Pocket Network is part of the full <strong>Cosmos ecosystem</strong>, being built entirely off the Cosmos SDK. That means Pocket has direct compatibility with the Cosmos ecosystem (wallets, explorers, IBC, etc.). The cosmos codebase is widely used making it <strong>easier</strong> for external contributors to work with the Pocket Network</p>
      <br/>
      <h2 class="text-[18px] font-bold">CometBTF Consensus</h2>
      <br/>
      <p class="text-[14px]"> The Pocket Network uses CometBFT as its consensus engine that is maintained by the Cosmos ecosystem. This offers Pocket great <strong>performance and security</strong>. It also ensures that Pocket is upgraded as the Cosmos core devs advance CometBFT.</p>
      <br/>
      <h2 class="text-[18px] font-bold">Claim & Proof Tree Structure</h2>
      <br/>
      <p class="text-[14.5px]">The Pocket Network adopts Celestia’s well-audited Sparse Merkle Sum Trie implementation (Celestia’s SMT). A state-of-the-art cryptographic data structure for scalability and interoperability. Compact proofs with <strong>minimal storage overhead</strong> make for strong and efficient cryptographic proofs. This choice allows for easier verification across chains (especially with IBC or DA layers), future-proofing Pocket against scaling bottlenecks.</p>
      <br/>
      <h2 class="text-[17px] font-bold">Shannon Code Base</h2>
      <br/>
      <p class="text-[14px]">By rebuilding fully on the Cosmos SDK, Shannon gains four key advantages (MICE):</p>
      <br/>

      <!-- Numbered List Items -->
      <h2 class="text-[1.25rem] font-bold text-gray-900 dark:text-gray-100 mb-4">Mainline Cosmos SDK</h2>
      
      <p class="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 mb-6">The Pocket Network is part of the full <strong class="font-semibold text-gray-900 dark:text-white">Cosmos ecosystem</strong>, being built entirely off the Cosmos SDK. That means Pocket has direct compatibility with the Cosmos ecosystem (wallets, explorers, IBC, etc.). The cosmos codebase is widely used making it <strong class="font-semibold text-gray-900 dark:text-white">easier</strong> for external contributors to work with the Pocket Network</p>
      
      <h2 class="text-[1.25rem] font-bold text-gray-900 dark:text-gray-100 mb-4">CometBFT Consensus</h2>
      
      <p class="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 mb-6">The Pocket Network uses CometBFT as its consensus engine that is maintained by the Cosmos ecosystem. This offers Pocket great <strong class="font-semibold text-gray-900 dark:text-white">performance and security</strong>. It also ensures that Pocket is upgraded as the Cosmos core devs advance CometBFT.</p>
      
      <h2 class="text-[1.25rem] font-bold text-gray-900 dark:text-gray-100 mb-4">Claim & Proof Tree Structure</h2>
      
      <p class="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 mb-6">The Pocket Network adopts Celestia's well-audited Sparse Merkle Sum Trie implementation (Celestia's SMT). A state-of-the-art cryptographic data structure for scalability and interoperability. Compact proofs with <strong class="font-semibold text-gray-900 dark:text-white">minimal storage overhead</strong> make for strong and efficient cryptographic proofs. This choice allows for easier verification across chains (especially with IBC or DA layers), future-proofing Pocket against scaling bottlenecks.</p>
      
      <h2 class="text-[1.25rem] font-bold text-gray-900 dark:text-gray-100 mb-4">Shannon Code Base</h2>
      
      <p class="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300 mb-6">By rebuilding fully on the Cosmos SDK, Shannon gains four key advantages (MICE):</p>
      
      <!-- Numbered List Items -->
      <div class="space-y-4 mb-6">
        <!-- Item 1 -->
        <div class="flex gap-4 border-l-4 border-blue-500 pl-6 py-2">
          <div class="flex-shrink-0">
            <span class="text-gray-700 dark:text-gray-300 font-medium">1.</span>
          </div>
          <div>
            <h3 class="text-gray-900 dark:text-gray-100 font-semibold inline">Modularity</h3>
            <span class="text-gray-600 dark:text-gray-400"> – A clean, modular design makes it easier for external contributors to add features and improve the network.</span>
          </div>
        </div>

        <!-- Item 2 -->
        <div class="flex gap-4 border-l-4 border-blue-500 pl-6 py-2">
          <div class="flex-shrink-0">
            <span class="text-gray-700 dark:text-gray-300 font-medium">2.</span>
          </div>
          <div>
            <h3 class="text-gray-900 dark:text-gray-100 font-semibold inline">Interoperability</h3>
            <span class="text-gray-600 dark:text-gray-400"> – With Inter-Blockchain Communication (IBC), Pocket can connect to other Data Availability (DA) networks and layer-1 chains such as Celestia and EigenDA.</span>
          </div>
        </div>

        <!-- Item 3 -->
        <div class="flex gap-4 border-l-4 border-blue-500 pl-6 py-2">
          <div class="flex-shrink-0">
            <span class="text-gray-700 dark:text-gray-300 font-medium">3.</span>
          </div>
          <div>
            <h3 class="text-gray-900 dark:text-gray-100 font-semibold inline">Compatibility</h3>
            <span class="text-gray-600 dark:text-gray-400"> – Any wallet, explorer, exchange, or bridge that works with Cosmos SDK chains also works with Pocket.</span>
          </div>
        </div>

        <!-- Item 4 -->
        <div class="flex gap-4 border-l-4 border-blue-500 pl-6 py-2">
          <div class="flex-shrink-0">
            <span class="text-gray-700 dark:text-gray-300 font-medium">4.</span>
          </div>
          <div>
            <h3 class="text-gray-900 dark:text-gray-100 font-semibold inline">Extensibility</h3>
            <span class="text-gray-600 dark:text-gray-400"> – Future upgrades to the Cosmos SDK can be adopted directly into Pocket.</span>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="h-px bg-[#e6ebf2] dark:bg-white/10"></div>
      <br/>

      <p class="text-[14px]">The next article explores the deployment of the Shannon upgrade, it's current stage of development and the prioritary upgrades that are coming to Pocket... </p>
      <br/>
    `
  },
}
