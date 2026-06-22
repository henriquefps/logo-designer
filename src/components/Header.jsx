import React from 'react';
import { PenTool } from 'lucide-react';

export default function Header() {
  return (
    <header className="app-header">
      <div className="header-top-row">
        <div className="logo-area">
          <PenTool className="header-logo" />
          <h1>LogoGo</h1>
        </div>
      </div>
      <p className="subtitle">
        Create custom logos and generate icon packs for Android, iOS, and Web.
      </p>
    </header>
  );
}
