import React from "react";

export default function BusinessPageHeader({
  eyebrow,
  title,
  description,
  children,
  className = ""
}) {
  return (
    <header className={`business-page-heading ${className}`.trim()}>
      <div className="business-page-intro">
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1 className="mb-1">{title}</h1>
        {description && <p className="text-muted mb-0">{description}</p>}
      </div>
      {children && <div className="business-page-actions">{children}</div>}
    </header>
  );
}
