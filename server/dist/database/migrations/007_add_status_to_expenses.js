export const up = (db) => {
    try {
        const tableInfo = db.getMany('PRAGMA table_info(expenses)', []);
        const columns = tableInfo.map((col) => col.name);
        if (!columns.includes('status')) {
            db.executeQuery("ALTER TABLE expenses ADD COLUMN status TEXT DEFAULT 'pending'");
        }
    }
    catch {
        // Column may already exist in migrated databases
    }
};
//# sourceMappingURL=007_add_status_to_expenses.js.map
