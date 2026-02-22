import { IconSearch } from "@tabler/icons-react";
import { TextInput, TextInputProps } from "@mantine/core";

interface SearchBarProps extends TextInputProps {
  placeholder?: string;
  ariaLabel?: string;
}

export function SearchBar({
  placeholder = "Search...",
  ariaLabel = "Search",
  ...props
}: SearchBarProps) {
  return (
    <TextInput
      radius="lg"
      size="sm"
      placeholder={placeholder}
      aria-label={ariaLabel}
      leftSection={<IconSearch size={16} stroke={1.25} />}
      {...props}
    />
  );
}
