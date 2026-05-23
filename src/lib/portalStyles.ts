export const PORTAL_STYLES = `
  .portal-outer {
    max-width: 780px;
    margin: 0 auto;
    padding: 32px 20px 80px;
    box-sizing: border-box;
  }
  .col-rule {
    height: 1px;
    background-color: rgba(0,0,0,0.08);
    margin: 36px 0;
  }
  .dk-card {
    background: #ffffff;
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: 12px;
    padding: 28px 32px;
    margin-bottom: 24px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.06);
  }
  .dk-card-elevated {
    background: #ffffff;
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: 12px;
    padding: 28px 32px;
    margin-bottom: 24px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.06);
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
      padding-top: 40px;
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
