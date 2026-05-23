export const PORTAL_STYLES = `
  .portal-outer {
    max-width: 780px;
    margin: 0 auto;
    padding: 48px 20px 80px;
    box-sizing: border-box;
  }
  .col-rule {
    height: 1px;
    background-color: rgba(255,255,255,0.09);
    margin: 36px 0;
  }
  .dk-card {
    background: #242118;
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 12px;
    padding: 28px 32px;
    margin-bottom: 24px;
  }
  .dk-card-elevated {
    background: #2e2922;
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 12px;
    padding: 28px 32px;
    margin-bottom: 24px;
  }
  .portal-columns { display: block; }
  .portal-col-side { margin-top: 48px; }
  @media (min-width: 768px) {
    .portal-outer {
      max-width: 1000px;
      padding-left: 40px;
      padding-right: 40px;
    }
  }
  @media (min-width: 1024px) {
    .portal-outer {
      max-width: 1540px;
      padding-left: 80px;
      padding-right: 80px;
      padding-top: 64px;
    }
    .portal-columns {
      display: grid;
      grid-template-columns: minmax(0, 44fr) minmax(0, 56fr);
      gap: 0 64px;
      align-items: start;
    }
    .portal-col-side { margin-top: 0; }
  }
`;
