import { useNavigation } from './NavigationContext';
import { ClozeScreen } from '../screens/Cloze';
import { CrosswordScreen } from '../screens/Crossword';
import { FlashcardsScreen } from '../screens/Flashcards';
import { LandingScreen } from '../screens/Landing';
import { NotesImportScreen } from '../screens/NotesImport';
import { PuzzlePickerScreen } from '../screens/PuzzlePicker';
import { SpacesScreen } from '../screens/Spaces';

export function RootNavigator() {
  const { route } = useNavigation();

  switch (route.name) {
    case 'landing':
      return <LandingScreen />;
    case 'import':
      return <NotesImportScreen />;
    case 'spaces':
      return <SpacesScreen />;
    case 'space':
      return <PuzzlePickerScreen spaceId={route.spaceId} />;
    case 'crossword':
      return <CrosswordScreen />;
    case 'cloze':
      return <ClozeScreen />;
    case 'flashcards':
      return <FlashcardsScreen />;
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}
