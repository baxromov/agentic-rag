/**
 * Error and warning alert component
 */

import { XMarkIcon } from '@heroicons/react/24/outline';

interface ErrorAlertProps {
  type?: 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  type = 'error',
  message,
  onClose,
  action,
}) => {
  const baseClasses = 'rounded-lg p-4 mb-4 flex items-start justify-between';

  const typeClasses = {
    error: 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200',
    warning: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
    info: 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  };

  return (
    <div className={`${baseClasses} ${typeClasses[type]}`}>
      <div className="flex-1">
        <p className="text-sm font-medium">{message}</p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-2 text-sm underline hover:no-underline"
          >
            {action.label}
          </button>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 flex-shrink-0 hover:opacity-70"
          aria-label="Close"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};
