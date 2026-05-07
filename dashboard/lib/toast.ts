import { toast } from 'sonner'

export const notify = {
  error: (msg: string) => toast.error(msg),
  success: (msg: string) => toast.success(msg),
  info: (msg: string) => toast(msg),
  warning: (msg: string) => toast.warning(msg),
}
