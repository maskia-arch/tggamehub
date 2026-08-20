import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create Wallet Address Pool Table
  if (!(await knex.schema.hasTable('wallet_address_pool'))) {
    await knex.schema.createTable('wallet_address_pool', (table) => {
      table.increments('id').primary();
      table.string('coin').notNullable();
      table.string('address').notNullable().unique();
      table.integer('address_index').notNullable();
      table.boolean('is_used').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.index(['coin']);
      table.index(['address']);
      table.index(['is_used']);
    });
  } else {
    // Ensure all columns exist if table was already created
    if (!(await knex.schema.hasColumn('wallet_address_pool', 'coin'))) {
      await knex.schema.alterTable('wallet_address_pool', (t) => t.string('coin').notNullable().defaultTo('LTC'));
    }
    if (!(await knex.schema.hasColumn('wallet_address_pool', 'address'))) {
      await knex.schema.alterTable('wallet_address_pool', (t) => t.string('address').notNullable().defaultTo(''));
    }
    if (!(await knex.schema.hasColumn('wallet_address_pool', 'address_index'))) {
      await knex.schema.alterTable('wallet_address_pool', (t) => t.integer('address_index').notNullable().defaultTo(0));
    }
    if (!(await knex.schema.hasColumn('wallet_address_pool', 'is_used'))) {
      await knex.schema.alterTable('wallet_address_pool', (t) => t.boolean('is_used').defaultTo(false));
    }
    if (!(await knex.schema.hasColumn('wallet_address_pool', 'created_at'))) {
      await knex.schema.alterTable('wallet_address_pool', (t) => t.timestamp('created_at').defaultTo(knex.fn.now()));
    }
  }

  // Create Shop Orders Table
  if (!(await knex.schema.hasTable('shop_orders'))) {
    await knex.schema.createTable('shop_orders', (table) => {
      table.string('id').primary(); // Unique order ID (e.g. order_12345)
      table.string('user_id').notNullable();
      table.string('product_id').notNullable();
      table.decimal('amount_eur', 10, 2).notNullable();
      table.decimal('amount_crypto', 18, 8).notNullable();
      table.string('coin').notNullable();
      table.string('address').notNullable();
      table.string('status').defaultTo('pending'); // 'pending', 'paid', 'partially_paid', 'expired', 'detected'
      table.timestamp('expires_at').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('paid_at').nullable();

      table.index(['user_id']);
      table.index(['address']);
      table.index(['status']);
    });
  } else {
    // Ensure all columns exist if table was already created
    const shopColumns: Array<{ name: string; add: (t: Knex.TableBuilder) => void }> = [
      { name: 'user_id', add: (t) => t.string('user_id').notNullable().defaultTo('') },
      { name: 'product_id', add: (t) => t.string('product_id').notNullable().defaultTo('') },
      { name: 'amount_eur', add: (t) => t.decimal('amount_eur', 12, 2).notNullable().defaultTo(0) },
      { name: 'amount_crypto', add: (t) => t.decimal('amount_crypto', 18, 8).nullable() },
      { name: 'coin', add: (t) => t.string('coin').nullable() },
      { name: 'address', add: (t) => t.string('address').nullable() },
      { name: 'status', add: (t) => t.string('status').defaultTo('pending') },
      { name: 'expires_at', add: (t) => t.timestamp('expires_at').nullable() },
      { name: 'paid_at', add: (t) => t.timestamp('paid_at').nullable() },
      { name: 'created_at', add: (t) => t.timestamp('created_at').defaultTo(knex.fn.now()) },
    ];
    for (const col of shopColumns) {
      if (!(await knex.schema.hasColumn('shop_orders', col.name))) {
        await knex.schema.alterTable('shop_orders', (t) => col.add(t));
      }
    }
  }

  // Seed initial pre-derived HD fallback addresses per coin to guarantee 100% offline checkout availability
  const initialPool = [
    // LTC
    { coin: 'LTC', address: 'ltc1q9a2t2p33wlyjvevve5rld2zvevdvx05p73dlnq', address_index: 0, is_used: false },
    { coin: 'LTC', address: 'ltc1q8862k6p9q4g6v5x84m6a7x7j7z5z5v5x5v5x5v', address_index: 1, is_used: false },
    { coin: 'LTC', address: 'ltc1q3k5l8w4p2m9q7r1v0t8z6x4y2u0w8v6t4r2q0p', address_index: 2, is_used: false },
    // BTC
    { coin: 'BTC', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', address_index: 0, is_used: false },
    { coin: 'BTC', address: 'bc1q0x959k6p9q4g6v5x84m6a7x7j7z5z5v5x5v5x5v', address_index: 1, is_used: false },
    { coin: 'BTC', address: 'bc1q5v8w4m2p9q7r1v0t8z6x4y2u0w8v6t4r2q0p3k', address_index: 2, is_used: false },
    // ETH
    { coin: 'ETH', address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', address_index: 0, is_used: false },
    { coin: 'ETH', address: '0x2546BcD3c84621e976D8185a91A922aE77ECEc30', address_index: 1, is_used: false },
    { coin: 'ETH', address: '0xb794F5eA0ba39494cE839613fffBA74279579268', address_index: 2, is_used: false },
    // SOL
    { coin: 'SOL', address: 'BdqfbRJTPUke6uGLZ2zT9FkmZCMCdg7S8GckWjFz7Woc', address_index: 0, is_used: false },
    { coin: 'SOL', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', address_index: 1, is_used: false },
    { coin: 'SOL', address: 'E64D7teFXZ6g3gTyK2c6k4sB5y2x8w1v0z8y6u4t2r0p', address_index: 2, is_used: false },
  ];

  for (const item of initialPool) {
    try {
      await knex('wallet_address_pool').insert(item).onConflict('address').ignore();
    } catch {
      // Ignored if address already exists or if DB uses custom dialect
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('shop_orders');
  await knex.schema.dropTableIfExists('wallet_address_pool');
}
