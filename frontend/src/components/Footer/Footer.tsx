/**
 * Footer — Professional, dense, SEO-rich footer for GridInsight.
 */

import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer style={{ background: '#111111', borderTop: '1px solid #2A2A2A', marginTop: 48 }}>
      {/* Main footer grid */}
      <div 
        className="footer-grid"
        style={{ 
          maxWidth: 1200, 
          margin: '0 auto', 
          padding: '48px 40px', 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, 1fr)', 
          gap: 32 
        }}
      >
        {/* Column 1: Brand */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 4, background: '#E10600',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 9, color: '#fff', fontWeight: 900 }}>F1</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '0.04em', color: '#F0F0F0' }}>
                GRID
              </span>
              <span style={{ fontWeight: 400, fontSize: 14, letterSpacing: '0.04em', color: '#E10600' }}>
                INSIGHT
              </span>
            </div>
          </div>
          <p style={{ 
            color: '#888', 
            fontSize: 12, 
            lineHeight: 1.6, 
            margin: 0,
            maxWidth: 240 
          }}>
            Formula 1 telemetry analysis, tyre strategy insights, and AI-powered 
            pit predictions. Built with real F1 data from every session since 2018.
          </p>
          {/* Social icons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <SocialLink href="https://x.com/gridinsight" label="X / Twitter" icon="X" />
            <SocialLink href="https://github.com/gridinsight" label="GitHub" icon="GH" />
            <SocialLink href="https://discord.gg/gridinsight" label="Discord" icon="DC" />
          </div>
        </div>

        {/* Column 2: Explore */}
        <div>
          <h4 style={{ 
            color: '#F0F0F0', 
            fontSize: 10, 
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.15em', 
            textTransform: 'uppercase', 
            margin: '0 0 16px 0' 
          }}>
            Explore
          </h4>
          <FooterLinkList links={[
            { href: '#', label: 'Latest Race Analysis' },
            { href: '#', label: 'Teammate Battles' },
            { href: '#', label: 'Championship Standings' },
            { href: '#', label: 'What-If Simulator' },
            { href: '#', label: 'PitSense AI Strategy' },
          ]} />
        </div>

        {/* Column 3: Seasons */}
        <div>
          <h4 style={{ 
            color: '#F0F0F0', 
            fontSize: 10, 
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.15em', 
            textTransform: 'uppercase', 
            margin: '0 0 16px 0' 
          }}>
            Seasons
          </h4>
          <FooterLinkList links={[
            { href: '#', label: '2026 Season' },
            { href: '#', label: '2025 Season' },
            { href: '#', label: '2024 Season' },
            { href: '#', label: '2023 Season' },
            { href: '#', label: '2022 Season' },
            { href: '#', label: '2021 Season' },
            { href: '#', label: '2020 Season' },
          ]} />
        </div>

        {/* Column 4: Popular Circuits */}
        <div>
          <h4 style={{ 
            color: '#F0F0F0', 
            fontSize: 10, 
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.15em', 
            textTransform: 'uppercase', 
            margin: '0 0 16px 0' 
          }}>
            Popular Circuits
          </h4>
          <FooterLinkList links={[
            { href: '#', label: 'Monza' },
            { href: '#', label: 'Spa-Francorchamps' },
            { href: '#', label: 'Silverstone' },
            { href: '#', label: 'Monaco' },
            { href: '#', label: 'Suzuka' },
            { href: '#', label: 'Jeddah' },
            { href: '#', label: 'Albert Park' },
          ]} />
        </div>
      </div>

      {/* Bottom bar — legal + tech */}
      <div style={{ borderTop: '1px solid #1E1E1E', padding: '20px 40px' }}>
        <div 
          className="footer-bottom"
          style={{ 
            maxWidth: 1200, 
            margin: '0 auto', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16 
          }}
        >
          {/* Legal disclaimer */}
          <p style={{ 
            color: '#555', 
            fontSize: 10, 
            lineHeight: 1.6, 
            margin: 0,
            maxWidth: 700 
          }}>
            This site is unofficial and is not associated in any way with the 
            Formula 1 companies. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE 
            WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trademarks of 
            Formula One Licensing B.V. All data sourced via FastF1.
          </p>

          {/* Legal links */}
          <div style={{ display: 'flex', gap: 24 }}>
            <FooterBottomLink href="#" label="Privacy Policy" />
            <FooterBottomLink href="#" label="Terms of Use" />
            <FooterBottomLink href="#" label="About" />
          </div>
        </div>
      </div>
    </footer>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SocialLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <a
      href={href}
      aria-label={label}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        width: 28,
        height: 28,
        borderRadius: 4,
        background: '#1A1A1A',
        border: '1px solid #2A2A2A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666',
        fontSize: 9,
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700,
        textDecoration: 'none',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#444';
        e.currentTarget.style.color = '#F0F0F0';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#2A2A2A';
        e.currentTarget.style.color = '#666';
      }}
    >
      {icon}
    </a>
  );
}

function FooterLinkList({ links }: { links: { href: string; label: string }[] }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {links.map((link) => (
        <li key={link.label}>
          <a
            href={link.href}
            style={{
              color: '#888',
              fontSize: 12,
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#F0F0F0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; }}
          >
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function FooterBottomLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      style={{
        color: '#555',
        fontSize: 10,
        textDecoration: 'none',
        transition: 'color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#888'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
    >
      {label}
    </a>
  );
}

export default Footer;
