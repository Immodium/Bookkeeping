// Expense component-related types and interfaces

import { Expense, ExpenseFormData } from '@/types/domain/expense.types';

// ExpenseViewModal component props
export interface ExpenseViewModalProps {
  expense: Expense | null;
  isOpen: boolean;
  onClose: () => void;
}

// ExpenseForm component props
export interface ExpenseFormProps {
  expense?: Expense | null;
  onSave: (expenseData: ExpenseFormData) => void;
  onCancel: () => void;
}

// ExpensesList component props
export interface ExpensesListProps {
  expenses: Expense[];
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (id: number) => void;
  onViewExpense: (expense: Expense) => void;
  onBulkDelete?: (ids: number[]) => void;
  onBulkCategorize?: (ids: number[], category: string) => void;
  onBulkChangeMerchant?: (ids: number[], merchant: string) => void;
  categories?: string[];
}