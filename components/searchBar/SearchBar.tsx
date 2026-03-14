import { IconSearch, IconX } from "@tabler/icons-react";
import { ActionIcon, TextInput, TextInputProps, Tooltip } from "@mantine/core";

interface SearchBarProps extends TextInputProps {
  placeholder?: string;
  ariaLabel?: string;
}

export function SearchBar({
  placeholder = "Search...",
  ariaLabel = "Search",
  value,
  onChange,
  ...props
}: SearchBarProps) {
  const handleClear = () => {
    onChange?.({ target: { value: "" }, currentTarget: { value: "" } } as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <TextInput
      radius="lg"
      size="sm"
      placeholder={placeholder}
      aria-label={ariaLabel}
      leftSection={<IconSearch size={16} stroke={1.25} />}
      rightSection={
        value ? (
          <Tooltip label="Clear" position="bottom" withArrow>
            <ActionIcon variant="transparent" color="gray" size="sm" onClick={handleClear} aria-label="Clear search">
              <IconX size={14} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        ) : null
      }
      value={value}
      onChange={onChange}
      {...props}
    />
  );
}
