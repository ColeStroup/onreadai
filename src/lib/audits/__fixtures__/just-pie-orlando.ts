export const justPieOrlandoHomepageHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Just Pie Orlando | Handmade Pies in Orlando</title>
    <meta name="description" content="Handmade pies for pickup, events, and special orders in Orlando.">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="canonical" href="https://www.justpieorlando.com/">
  </head>
  <body>
    <header>
      <nav aria-label="Primary navigation">
        <a href="/menu">Menu</a>
        <a href="/order-inquiries">Order Inquiries</a>
        <a href="/about">About</a>
      </nav>
    </header>
    <main>
      <h1>Handmade pies for every Orlando celebration</h1>
      <p>Need a custom order? Visit our Order Inquiries page and tell us what you need.</p>
      <section aria-labelledby="contact-heading">
        <h2 id="contact-heading">CONTACT US</h2>
        <p>Questions about an order? Email orders@justpieorlando.com.</p>
      </section>
    </main>
  </body>
</html>`;

export const justPieOrderInquiriesHtml = `<!doctype html>
<html lang="en">
  <head><title>Order Inquiries | Just Pie Orlando</title></head>
  <body>
    <main>
      <h1>Order Inquiries</h1>
      <p>Tell us the date, pie flavors, and quantity you need.</p>
      <form action="/order-inquiries" method="post">
        <label>Email <input type="email" name="email"></label>
        <label>Order details <textarea name="details"></textarea></label>
        <button type="submit">Send order inquiry</button>
      </form>
    </main>
  </body>
</html>`;

export const noContactHomepageHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>Example Studio</title>
    <meta name="description" content="A small example studio.">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="canonical" href="https://example.test/">
  </head>
  <body><main><h1>Example Studio</h1><p>Welcome to our studio.</p></main></body>
</html>`;
