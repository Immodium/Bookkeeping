export const up = (db) => {
    // Ensure expenses table has all expected columns
    try {
        const tableInfo = db.getMany('PRAGMA table_info(expenses)', []);
        const columns = tableInfo.map((col) => col.name);
        if (!columns.includes('project')) {
            db.executeQuery('ALTER TABLE expenses ADD COLUMN project TEXT');
        }
        if (!columns.includes('is_billable')) {
            db.executeQuery('ALTER TABLE expenses ADD COLUMN is_billable INTEGER DEFAULT 0');
        }
        if (!columns.includes('client_id')) {
            db.executeQuery('ALTER TABLE expenses ADD COLUMN client_id INTEGER');
        }
        if (!columns.includes('status')) {
            db.executeQuery("ALTER TABLE expenses ADD COLUMN status TEXT DEFAULT 'pending'");
        }
    }
    catch {
        // Columns may already exist
    }
};
//# sourceMappingURL=004_fix_expenses_table_schema.js.map