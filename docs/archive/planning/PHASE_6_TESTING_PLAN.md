# Phase 6: Testing and Quality Assurance - Implementation Plan

## Overview
This document outlines the comprehensive testing strategy for ImmuniCare UI Improvements Phase 6.

## Testing Infrastructure ✅ COMPLETE

### Setup Complete
- ✅ Vitest installed and configured
- ✅ @testing-library/react installed
- ✅ @testing-library/user-event installed
- ✅ @testing-library/jest-dom installed
- ✅ jsdom environment configured
- ✅ Test setup file created (`src/test/setup.js`)
- ✅ Test scripts added to package.json:
  - `npm test` - Run tests in watch mode
  - `npm test:ui` - Run tests with UI
  - `npm test:coverage` - Run tests with coverage report

### Configuration
```javascript
// vite.config.js
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: './src/test/setup.js',
  css: true,
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    exclude: [
      'node_modules/',
      'src/test/',
      '**/*.test.{js,jsx}',
      '**/*.spec.{js,jsx}'
    ]
  }
}
```

## Task 39: Unit Testing

### Completed Tests ✅

#### 39.1 Avatar Component ✅
- **File**: `client/src/components/Avatar.test.jsx`
- **Tests**: 29 tests, all passing
- **Coverage Areas**:
  - Initials generation (8 tests)
  - Size variants (5 tests)
  - Color generation (4 tests)
  - Styling and classes (3 tests)
  - Accessibility (4 tests)
  - Edge cases (5 tests)

#### 39.2 ProgressBar Component ✅
- **File**: `client/src/components/ProgressBar.test.jsx`
- **Tests**: 33 tests, all passing
- **Coverage Areas**:
  - Basic rendering (3 tests)
  - Value constraints (5 tests)
  - Accessibility (6 tests)
  - Segment display (7 tests)
  - Styling and animation (5 tests)
  - Edge cases (5 tests)
  - Dynamic updates (2 tests)

### Remaining Unit Tests (To Be Implemented)

#### 39.3 InfoCard Component
**Priority**: High
**Estimated Tests**: 15-20

Test areas:
- Basic rendering with title and children
- Custom className application
- Responsive grid layout
- Hover states
- Accessibility (semantic HTML)
- Edge cases (empty content, long titles)

**Example Test Structure**:
```javascript
describe('InfoCard Component', () => {
  describe('Basic Rendering', () => {
    it('renders title correctly');
    it('renders children content');
    it('applies default styling');
  });
  
  describe('Styling', () => {
    it('applies custom className');
    it('has card styling (border, shadow, padding)');
    it('title has correct styling (uppercase, bold, gray)');
  });
  
  describe('Accessibility', () => {
    it('uses semantic HTML structure');
    it('title is properly associated with content');
  });
});
```

#### 39.4 FilterToolbar Component
**Priority**: Critical
**Estimated Tests**: 30-40

Test areas:
- Search input with real-time filtering
- Clear button functionality
- Barangay dropdown filter
- Sex dropdown filter
- Age range dropdown filter
- Sort dropdown
- Filter persistence in sessionStorage
- Responsive layout
- Debounced search (300ms)
- Multiple filters applied together (AND logic)

**Example Test Structure**:
```javascript
describe('FilterToolbar Component', () => {
  describe('Search Functionality', () => {
    it('renders search input');
    it('calls onChange handler on input');
    it('shows clear button when text exists');
    it('clears search on clear button click');
    it('debounces search input (300ms)');
  });
  
  describe('Filter Dropdowns', () => {
    it('renders barangay filter');
    it('renders sex filter with All/Male/Female options');
    it('renders age range filter');
    it('calls filter handlers on selection');
  });
  
  describe('Sort Functionality', () => {
    it('renders sort dropdown');
    it('has all sort options (Name A-Z, Name Z-A, Date, Age)');
    it('calls sort handler on selection');
  });
  
  describe('Filter Persistence', () => {
    it('loads filters from sessionStorage on mount');
    it('saves filters to sessionStorage on change');
    it('uses category-specific storage keys');
  });
  
  describe('Responsive Layout', () => {
    it('stacks vertically on mobile');
    it('displays in row on desktop');
  });
});
```

#### 39.5 InfantCard Component
**Priority**: Critical
**Estimated Tests**: 35-45

Test areas:
- Avatar integration
- Infant name and status badge display
- Metadata display (ID, sex, age)
- Location display (barangay, purok)
- Phone number display
- Next due vaccine/overdue warning
- Action buttons (View Record, Send SMS, Record Vaccination)
- Checkbox for bulk selection
- Hover states
- Category-specific displays (CPAB, Zero-Dose, Under-Immunized)
- Alternating row backgrounds

**Example Test Structure**:
```javascript
describe('InfantCard Component', () => {
  const mockInfant = {
    id: 1,
    name: 'Juan Dela Cruz',
    reference_id: 'INF-001',
    sex: 'Male',
    age_months: 6,
    barangay: 'Barangay 1',
    purok: 'Purok 1',
    caregiver_phone: '09171234567',
    status: 'APPROVED',
    next_due_vaccine: 'Pentavalent 2',
    next_due_date: '2024-04-15',
    days_overdue: null
  };
  
  describe('Basic Display', () => {
    it('renders infant name');
    it('renders status badge');
    it('renders reference ID, sex, and age');
    it('renders location with icon');
    it('renders phone with icon');
    it('integrates Avatar component');
  });
  
  describe('Action Buttons', () => {
    it('renders View Record button');
    it('renders Send SMS button');
    it('renders Record Vaccination button');
    it('calls appropriate handlers on click');
  });
  
  describe('Category-Specific Display', () => {
    it('shows TT dates for CPAB category');
    it('shows zero-dose warning for zero-dose category');
    it('shows missing vaccines for under-immunized category');
    it('applies urgency border colors');
  });
  
  describe('Selection', () => {
    it('renders checkbox');
    it('calls onSelect handler on checkbox click');
    it('shows selected state');
  });
});
```

#### 39.6 KPIDetailModal Component
**Priority**: Critical
**Estimated Tests**: 40-50

Test areas:
- Modal open/close
- Header with icon, title, stats
- FilterToolbar integration
- InfantCard list rendering
- Pagination (20 items per page)
- Bulk selection (Select All)
- Bulk actions (Send SMS, Export CSV)
- Category-specific filtering (CPAB, Zero-Dose, etc.)
- Escape key to close
- Smooth animations
- Empty states

#### 39.7 Filter Logic Tests
**Priority**: Critical
**Estimated Tests**: 25-30

Test areas:
- Search by name (case-insensitive)
- Search by reference ID
- Search by barangay
- Search by phone
- Filter by barangay
- Filter by sex
- Filter by age range
- Combined filters (AND logic)
- Empty results handling

#### 39.8 Sort Logic Tests
**Priority**: High
**Estimated Tests**: 10-15

Test areas:
- Sort by name (A-Z)
- Sort by name (Z-A)
- Sort by date (newest first)
- Sort by date (oldest first)
- Sort by age (youngest first)
- Sort by age (oldest first)
- Sort by urgency (zero-dose days DESC)

#### 39.9 Vaccine Deduplication Tests
**Priority**: High
**Estimated Tests**: 15-20

Test areas:
- Remove duplicate vaccine entries
- Normalize vaccine names (PENTA-1 → Pentavalent 1)
- Handle different date formats
- Preserve most recent entry
- Handle edge cases (null dates, missing data)

#### 39.10 Progress Calculation Tests
**Priority**: High
**Estimated Tests**: 15-20

Test areas:
- Calculate completed vaccines
- Calculate total vaccines (14 NIP vaccines)
- Calculate percentage
- Handle edge cases (0 vaccines, all vaccines)
- Verify against NIP schedule

#### 39.11 Birth Dose Verification Tests
**Priority**: High
**Estimated Tests**: 15-20

Test areas:
- Verify BCG given on day of birth
- Verify Hepatitis B given within 24 hours
- Calculate timing from birth date
- Handle missing dates
- Handle edge cases (premature births, delayed registration)

#### 39.12 Code Coverage Target
**Priority**: Critical
**Target**: >80% coverage for all components

**How to Check Coverage**:
```bash
npm run test:coverage
```

**Coverage Report Location**: `client/coverage/index.html`

## Task 40: Integration Testing

### Test Areas

#### 40.1 Modal Open/Close from Dashboard
- Click KPI card opens correct modal
- Modal displays correct category data
- Close button closes modal
- Escape key closes modal
- Backdrop click closes modal

#### 40.2 Filter Persistence Across Sessions
- Filters saved to sessionStorage
- Filters loaded on page refresh
- Category-specific filter keys
- Filters cleared on logout

#### 40.3 Pagination with Different Data Sizes
- 20 items per page
- Correct page count calculation
- Previous/Next buttons work
- Disable buttons on first/last page
- Reset to page 1 on filter change

#### 40.4 Bulk Selection and Actions
- Select All checkbox
- Individual selection
- Bulk SMS action
- Export CSV action
- Export Selected action

#### 40.5 Navigation to Infant Detail View
- Click "View Record" navigates correctly
- Infant ID passed in URL
- Back button returns to dashboard
- Breadcrumb navigation works

#### 40.6 Search with Various Input Types
- Text search (names)
- Numeric search (IDs)
- Phone number search
- Special characters handling
- Empty search results

#### 40.7 Responsive Behavior
- Mobile (<768px): 1-card stack
- Tablet (768-1023px): 2-card grid
- Desktop (≥1024px): 3-card grid
- Filter toolbar stacking on mobile

#### 40.8 Keyboard Navigation
- Tab through interactive elements
- Enter to activate buttons
- Escape to close modals
- Arrow keys in dropdowns
- Focus indicators visible

#### 40.9 Error Handling for API Failures
- Network error display
- Retry mechanism
- Graceful degradation
- Error messages user-friendly

#### 40.10 Empty States and Edge Cases
- No infants found
- No search results
- Empty categories
- Missing data fields

## Task 41: Accessibility Testing

### Automated Testing

#### 41.1 Run Automated Accessibility Audit
**Tools**: axe-core, Lighthouse

```bash
# Install axe-core for testing
npm install --save-dev @axe-core/react

# Run Lighthouse audit
lighthouse http://localhost:5173 --view
```

**Integration with Tests**:
```javascript
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

it('should not have accessibility violations', async () => {
  const { container } = render(<Component />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

#### 41.2 Keyboard-Only Navigation Test
- Tab through all interactive elements
- No keyboard traps
- Skip links work
- Focus order logical

#### 41.3 Screen Reader Testing
**Tools**: NVDA (Windows), JAWS (Windows), VoiceOver (Mac)

Test checklist:
- All images have alt text
- Form labels properly associated
- ARIA labels present and descriptive
- Landmark regions defined
- Heading hierarchy correct

#### 41.4 Color Contrast Ratios (WCAG AA)
**Tool**: WebAIM Contrast Checker

Verify:
- Primary text: 4.5:1 minimum
- Large text: 3:1 minimum
- UI components: 3:1 minimum
- Focus indicators: 3:1 minimum

#### 41.5 Focus Management in Modals
- Focus trapped in modal when open
- Focus returns to trigger on close
- First focusable element focused on open
- Escape key closes modal

#### 41.6 ARIA Labels and Roles
- role="progressbar" on progress bars
- role="img" on avatars
- role="dialog" on modals
- aria-label on icon buttons
- aria-describedby for help text

#### 41.7 Browser Zoom (200%, 400%)
- Layout doesn't break
- Text remains readable
- No horizontal scrolling
- Interactive elements accessible

#### 41.8 High Contrast Mode
- Test in Windows High Contrast Mode
- Borders visible
- Focus indicators visible
- Icons distinguishable

#### 41.9 Touch Target Sizes on Mobile
- Minimum 44x44px touch targets
- Adequate spacing between targets
- No overlapping interactive elements

#### 41.10 Accessibility Compliance Report
**Template**: Create report documenting:
- WCAG 2.1 AA compliance status
- Issues found and remediated
- Outstanding issues with workarounds
- Testing methodology
- Tools used

## Task 42: Performance Testing

### 42.1 Lighthouse Performance Audit
```bash
lighthouse http://localhost:5173 --only-categories=performance --view
```

**Target Scores**:
- Performance: >90
- First Contentful Paint: <1.8s
- Largest Contentful Paint: <2.5s
- Time to Interactive: <3.8s
- Cumulative Layout Shift: <0.1

### 42.2 Initial Page Load Time
**Target**: <2 seconds

**Measurement**:
```javascript
// Add to main.jsx
const startTime = performance.now();
window.addEventListener('load', () => {
  const loadTime = performance.now() - startTime;
  console.log(`Page load time: ${loadTime}ms`);
});
```

### 42.3 Time to Interactive
**Target**: <3 seconds

**Measurement**: Use Lighthouse or Chrome DevTools Performance tab

### 42.4 Search Response Time
**Target**: <500ms

**Test**:
```javascript
it('search responds within 500ms', async () => {
  const startTime = performance.now();
  fireEvent.change(searchInput, { target: { value: 'Juan' } });
  await waitFor(() => {
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
  });
  const responseTime = performance.now() - startTime;
  expect(responseTime).toBeLessThan(500);
});
```

### 42.5 Modal Animation Time
**Target**: <300ms

**Test**: Measure modal open/close animation duration

### 42.6 Large Dataset Testing
**Test with**: 1000+ infant records

Areas to test:
- Virtualized scrolling performance
- Filter/search performance
- Pagination performance
- Memory usage

### 42.7 Slow Network Testing (3G Simulation)
**Chrome DevTools**: Network tab → Throttling → Slow 3G

Test:
- Page load time
- Image loading
- API response handling
- Loading states display

### 42.8 Bundle Size Optimization
**Current bundle size**: Check with `npm run build`

**Optimization strategies**:
- Code splitting
- Tree shaking
- Lazy loading components
- Image optimization (WebP)
- Remove unused dependencies

### 42.9 Memory Usage and Leak Detection
**Chrome DevTools**: Memory tab → Heap snapshot

Test:
- Take snapshot before modal open
- Open/close modal 10 times
- Take snapshot after
- Compare memory usage
- Check for detached DOM nodes

### 42.10 Performance Benchmark Report
**Template**:
```markdown
# Performance Benchmark Report

## Test Environment
- Browser: Chrome 120
- Device: Desktop (Intel i7, 16GB RAM)
- Network: Fast 3G

## Results
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Initial Load | <2s | 1.8s | ✅ |
| Time to Interactive | <3s | 2.5s | ✅ |
| Search Response | <500ms | 350ms | ✅ |
| Modal Animation | <300ms | 250ms | ✅ |

## Recommendations
1. Implement code splitting for routes
2. Lazy load modal components
3. Optimize images with WebP format
```

## Task 43: Cross-Browser Testing

### 43.1-43.6 Browser Testing Matrix

| Browser | Version | Desktop | Mobile | Status |
|---------|---------|---------|--------|--------|
| Chrome | Latest | ✅ | ✅ | To Test |
| Firefox | Latest | ✅ | N/A | To Test |
| Safari | Latest | ✅ | ✅ | To Test |
| Edge | Latest | ✅ | N/A | To Test |
| Chrome Mobile | Latest | N/A | ✅ | To Test |
| Safari iOS | Latest | N/A | ✅ | To Test |

### Test Checklist for Each Browser
- [ ] Dashboard loads correctly
- [ ] KPI modals open/close
- [ ] Filters work correctly
- [ ] Search functions properly
- [ ] Pagination works
- [ ] Infant detail view displays correctly
- [ ] Forms submit successfully
- [ ] Responsive layout correct
- [ ] Animations smooth
- [ ] No console errors

### 43.7 Browser-Specific Issues Documentation
**Format**:
```markdown
## Issue: Modal backdrop not visible in Safari 14
- **Browser**: Safari 14.0
- **Impact**: Medium
- **Workaround**: Added -webkit-backdrop-filter
- **Status**: Fixed
```

### 43.8 Polyfills Implementation
**If needed for older browsers**:
```javascript
// vite.config.js
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ]
});
```

### 43.9 Older Browser Version Testing
**If required by stakeholders**:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### 43.10 Browser Compatibility Matrix
**Template**: See table above

## Task 44: User Acceptance Testing

### 44.1 Conduct UAT with 3-5 Midwives
**Recruitment**:
- 3-5 midwives from different barangays
- Mix of tech-savvy and less experienced users
- Represent typical user base

### 44.2 UAT Test Scenarios and Scripts

#### Scenario 1: View and Filter Infant List
```
1. Log in to the system
2. Click on "Total Infants" KPI card
3. Use search to find an infant by name
4. Filter by barangay
5. Filter by sex
6. Sort by age
7. Click "View Record" on an infant
8. Navigate back to dashboard

Expected: All filters work, infant detail loads correctly
```

#### Scenario 2: Identify Zero-Dose Infants
```
1. Click on "Zero-Dose" KPI card
2. Review list of zero-dose infants
3. Note the urgency indicators
4. Select multiple infants
5. Click "Send SMS to Selected"
6. Verify SMS modal opens with correct recipients

Expected: Zero-dose infants clearly identified, bulk SMS works
```

#### Scenario 3: Record Batch Vaccination
```
1. Navigate to batch vaccination interface
2. Select vaccine type (e.g., Pentavalent 1)
3. Search and select multiple infants
4. Enter batch number and date
5. Submit batch vaccination
6. Verify success message
7. Check infant records updated

Expected: Batch vaccination recorded for all selected infants
```

### 44.3 Collect Feedback on Usability
**Feedback Form**:
```
1. How easy was it to find an infant record? (1-5)
2. How clear were the filter options? (1-5)
3. How useful is the zero-dose identification? (1-5)
4. How intuitive is the batch vaccination feature? (1-5)
5. What did you like most about the new interface?
6. What was confusing or difficult?
7. What features would you like to see added?
```

### 44.4 Identify Pain Points and Confusion Areas
**Observation Checklist**:
- Where do users hesitate?
- What do they click on repeatedly?
- What questions do they ask?
- What errors do they encounter?
- What features do they miss?

### 44.5 Measure Task Completion Time
**Benchmark Tasks**:
| Task | Target Time | Actual Time | Status |
|------|-------------|-------------|--------|
| Find infant by name | <10s | | |
| Filter zero-dose infants | <15s | | |
| Record batch vaccination | <2min | | |
| View infant detail | <5s | | |

### 44.6 Measure Task Success Rate
**Target**: >90% success rate for all tasks

**Calculation**:
```
Success Rate = (Successful Completions / Total Attempts) × 100
```

### 44.7 Conduct Post-UAT Survey
**Survey Questions**:
1. Overall satisfaction (1-5)
2. Likelihood to recommend (1-10)
3. Improvement over old system (1-5)
4. Confidence in using system (1-5)
5. Open-ended feedback

### 44.8 Document All Feedback and Issues
**Issue Template**:
```markdown
## Issue #1: Confusing filter labels
- **Reporter**: Midwife A
- **Severity**: Medium
- **Description**: "All Ages" label unclear
- **Suggested Fix**: Change to "All Age Ranges"
- **Status**: To be fixed
```

### 44.9 Prioritize Feedback for Implementation
**Priority Matrix**:
| Priority | Criteria | Examples |
|----------|----------|----------|
| P0 - Critical | Blocks core workflow | Cannot record vaccinations |
| P1 - High | Significant usability issue | Confusing navigation |
| P2 - Medium | Minor inconvenience | Unclear label |
| P3 - Low | Nice to have | Additional feature request |

### 44.10 UAT Summary Report
**Template**:
```markdown
# UAT Summary Report

## Participants
- 5 midwives from 3 barangays
- Experience range: 2-15 years
- Tech proficiency: Mixed

## Key Findings
### Positive Feedback
- Faster infant lookup (avg 8s vs 45s previously)
- Clear zero-dose identification
- Batch vaccination saves time

### Issues Identified
1. Filter labels confusing (P2)
2. SMS button placement unclear (P1)
3. Need keyboard shortcuts (P3)

### Metrics
- Task success rate: 94%
- Average satisfaction: 4.2/5
- NPS score: 8.5/10

## Recommendations
1. Revise filter labels
2. Add keyboard shortcuts guide
3. Improve SMS button visibility
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- Avatar.test.jsx
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests with UI
```bash
npm run test:ui
```

### Run Tests in CI/CD
```bash
npm test -- --run --reporter=json --outputFile=test-results.json
```

## Test Coverage Goals

### Current Coverage
- Avatar: 100% (29/29 tests passing)
- ProgressBar: 100% (33/33 tests passing)

### Target Coverage by Component
| Component | Target | Current | Status |
|-----------|--------|---------|--------|
| Avatar | >80% | 100% | ✅ |
| ProgressBar | >80% | 100% | ✅ |
| InfoCard | >80% | 0% | ⏳ |
| FilterToolbar | >80% | 0% | ⏳ |
| InfantCard | >80% | 0% | ⏳ |
| KPIDetailModal | >80% | 0% | ⏳ |
| InfantDetailView | >80% | 0% | ⏳ |

### Overall Target
- **Line Coverage**: >80%
- **Branch Coverage**: >75%
- **Function Coverage**: >80%
- **Statement Coverage**: >80%

## Next Steps

1. **Immediate** (Next 2-3 days):
   - Complete InfoCard tests (39.3)
   - Complete FilterToolbar tests (39.4)
   - Complete InfantCard tests (39.5)

2. **Short-term** (Next week):
   - Complete KPIDetailModal tests (39.6)
   - Complete filter/sort logic tests (39.7-39.8)
   - Complete vaccine deduplication tests (39.9)

3. **Medium-term** (Next 2 weeks):
   - Integration testing (Task 40)
   - Accessibility testing (Task 41)
   - Performance testing (Task 42)

4. **Before Production**:
   - Cross-browser testing (Task 43)
   - User acceptance testing (Task 44)
   - Final coverage report
   - Documentation updates

## Resources

### Documentation
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Documentation](https://testing-library.com/docs/react-testing-library/intro/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Lighthouse Documentation](https://developers.google.com/web/tools/lighthouse)

### Tools
- Vitest: Test runner
- @testing-library/react: Component testing
- @testing-library/user-event: User interaction simulation
- axe-core: Accessibility testing
- Lighthouse: Performance and accessibility auditing
- Chrome DevTools: Performance profiling

### Best Practices
1. Write tests before fixing bugs (TDD)
2. Test user behavior, not implementation
3. Keep tests simple and focused
4. Use descriptive test names
5. Mock external dependencies
6. Test edge cases and error states
7. Maintain >80% code coverage
8. Run tests in CI/CD pipeline

## Conclusion

This testing plan provides a comprehensive roadmap for Phase 6 implementation. The infrastructure is now in place, and initial component tests demonstrate the testing patterns to follow. Prioritize critical components (FilterToolbar, InfantCard, KPIDetailModal) and ensure >80% coverage before moving to integration and UAT.
