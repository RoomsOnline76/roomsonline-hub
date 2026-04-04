ALTER TABLE public.properties ADD COLUMN is_test_property boolean NOT NULL DEFAULT false;

UPDATE public.properties SET is_test_property = true WHERE id IN (
  '4d3f49cd-1f96-4d5d-b649-04a48d855fda',
  '93f79b31-8e65-4718-b3d8-179436ba0dd1',
  'a1ae2891-74d8-45d5-a608-ce8c4c7ac558',
  '88a824dd-3d98-4c73-a489-dff950214846',
  '8c4cc020-47ca-42c3-b448-fc19ac83038d',
  '1a4d3334-16ec-4554-b228-e3e552c1cad8',
  '0d912cf4-1ca7-4b8f-b6b0-787667daecdc',
  'e5f98eea-30bf-4c7b-a79b-df1620439281',
  'cd424b0b-a039-4d14-8f3b-3787f59aaf2d',
  'ea9a019d-1299-46eb-b371-a0b25eb60350'
);

UPDATE public.properties SET is_active = true WHERE id = '4d3f49cd-1f96-4d5d-b649-04a48d855fda';