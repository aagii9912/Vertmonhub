/**
 * Services index - Re-export all service classes
 */

export { CustomerService, customerService } from './CustomerService';
export { ChatHistoryService, chatHistoryService } from './ChatHistoryService';

// Re-export types
export type { CreateCustomerData, UpdateCustomerData } from './CustomerService';
export type { SaveChatData, ChatHistoryEntry } from './ChatHistoryService';
